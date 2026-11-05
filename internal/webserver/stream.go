package webserver

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/beilunyang/openhongguo/sdk"
)

const (
	// MaxCachedEpisodes 限制本地磁盘缓存最多保留12集
	MaxCachedEpisodes = 12
	// PrefetchCount 自动预先缓存当前播放集后面的10集
	PrefetchCount = 10
)

// EpisodeItem represents an episode in sequence.
type EpisodeItem struct {
	ID     string `json:"id"`
	Number int    `json:"number"`
	Title  string `json:"title,omitempty"`
}

// WindowPlayRequest represents a request to notify active playback and update cache window.
type WindowPlayRequest struct {
	SeriesID  string        `json:"series_id"`
	EpisodeID string        `json:"episode_id"`
	Quality   string        `json:"quality"`
	Episodes  []EpisodeItem `json:"episodes,omitempty"`
}

// WindowStatus reports current sliding window cache status.
type WindowStatus struct {
	SeriesID      string   `json:"series_id"`
	CurrentEpID   string   `json:"current_ep_id"`
	CurrentEpNum  int      `json:"current_ep_num"`
	Quality       string   `json:"quality"`
	MaxCached     int      `json:"max_cached"`
	PrefetchCount int      `json:"prefetch_count"`
	CachedEpIDs   []string `json:"cached_ep_ids"`
	CachedEpNums  []int    `json:"cached_ep_nums"`
	TotalCached   int      `json:"total_cached"`
	IsPrefetching bool     `json:"is_prefetching"`
	LastEvent     string   `json:"last_event"`
}

type activeWindow struct {
	mu             sync.Mutex
	seriesID       string
	quality        string
	currentEpID    string
	currentEpIndex int
	episodes       []EpisodeItem
	cancelPrefetch context.CancelFunc
	isPrefetching  bool
	lastEvent      string
}

// StreamManager coordinates video streaming, decryption, and caching.
type StreamManager struct {
	client     *sdk.Client
	cacheDir   string
	ffmpegPath string
	locks      sync.Map // key -> *sync.Mutex
	window     activeWindow
}

// NewStreamManager creates a new stream manager.
func NewStreamManager(client *sdk.Client, cacheDir, ffmpegPath string) (*StreamManager, error) {
	if cacheDir == "" {
		base, err := os.UserCacheDir()
		if err != nil {
			base = os.TempDir()
		}
		cacheDir = filepath.Join(base, "openhongguo", "media_cache")
	}
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create cache dir: %w", err)
	}
	if ffmpegPath == "" {
		ffmpegPath = FindTool("ffmpeg")
	}
	return &StreamManager{
		client:     client,
		cacheDir:   cacheDir,
		ffmpegPath: ffmpegPath,
	}, nil
}

func (sm *StreamManager) getLock(key string) *sync.Mutex {
	actual, _ := sm.locks.LoadOrStore(key, &sync.Mutex{})
	return actual.(*sync.Mutex)
}

// CachePath returns the full path of a cached episode stream.
func (sm *StreamManager) CachePath(episodeID, quality string) string {
	if quality == "" {
		quality = "720p"
	}
	return filepath.Join(sm.cacheDir, fmt.Sprintf("%s_%s.mp4", episodeID, quality))
}

// IsEpisodeCached checks if the episode is completely decrypted and present in cache.
func (sm *StreamManager) IsEpisodeCached(episodeID, quality string) bool {
	if quality == "" {
		quality = "720p"
	}
	target := sm.CachePath(episodeID, quality)
	fi, err := os.Stat(target)
	return err == nil && fi.Size() > 0
}

// EnsureCached ensures that the episode is decrypted and stored in cache.
func (sm *StreamManager) EnsureCached(ctx context.Context, episodeID, quality string) (string, error) {
	if quality == "" {
		quality = "720p"
	}
	target := sm.CachePath(episodeID, quality)

	// Fast path: already cached
	if fi, err := os.Stat(target); err == nil && fi.Size() > 0 {
		return target, nil
	}

	lock := sm.getLock(target)
	lock.Lock()
	defer lock.Unlock()

	// Double check
	if fi, err := os.Stat(target); err == nil && fi.Size() > 0 {
		return target, nil
	}

	// Resolve playback
	if sm.client == nil {
		return "", errors.New("client is not configured")
	}
	pb, err := sm.client.ResolvePlayback(ctx, episodeID, sdk.PlaybackOptions{})
	if err != nil && !errors.Is(err, sdk.ErrDRMProtected) {
		return "", fmt.Errorf("resolve playback failed: %w", err)
	}
	if pb == nil {
		return "", fmt.Errorf("no playback info returned for episode %s", episodeID)
	}

	stream, err := pb.Select(quality)
	if err != nil {
		// Fallback to best available
		stream, err = pb.Select("best")
		if err != nil {
			return "", fmt.Errorf("no valid stream found: %w", err)
		}
	}

	// Check if stream is protected
	var contentKey string
	if pb.Protected || stream.Protected {
		key, kErr := sdk.ContentKey(pb)
		if kErr != nil {
			return "", fmt.Errorf("failed to derive content key: %w", kErr)
		}
		contentKey = key.Hex
	}

	tmpFile := target + ".tmp"
	_ = os.Remove(tmpFile)

	if contentKey != "" {
		if sm.ffmpegPath == "" {
			return "", errors.New("ffmpeg is required to decrypt protected media, but not found")
		}
		args := []string{
			"-hide_banner", "-loglevel", "warning", "-nostdin", "-y",
			"-decryption_key", contentKey,
			"-i", stream.URL,
		}
		if pb.AudioURL != "" {
			args = append(args, "-decryption_key", contentKey, "-i", pb.AudioURL)
		}
		args = append(args, "-c", "copy", "-movflags", "+faststart", "-f", "mp4", tmpFile)

		cmd := exec.CommandContext(ctx, sm.ffmpegPath, args...)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		if runErr := cmd.Run(); runErr != nil {
			_ = os.Remove(tmpFile)
			return "", fmt.Errorf("ffmpeg decryption failed: %v, stderr: %s", runErr, stderr.String())
		}
	} else {
		// Clear stream: download directly
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, stream.URL, nil)
		if err != nil {
			return "", err
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return "", fmt.Errorf("download failed: %w", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return "", fmt.Errorf("download returned HTTP %d", resp.StatusCode)
		}
		out, err := os.OpenFile(tmpFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
		if err != nil {
			return "", err
		}
		_, copyErr := io.Copy(out, resp.Body)
		closeErr := out.Close()
		if copyErr != nil || closeErr != nil {
			_ = os.Remove(tmpFile)
			return "", fmt.Errorf("write cache failed: %v / %v", copyErr, closeErr)
		}
	}

	// Rename atomically
	if err := os.Rename(tmpFile, target); err != nil {
		_ = os.Remove(tmpFile)
		return "", fmt.Errorf("rename to cache target failed: %w", err)
	}

	return target, nil
}

// ActivateWindow manages the sliding window cache:
// 1. Checks if the requested episode is already cached.
// 2. If jumped and NOT cached: clears all existing cache files and starts fresh.
// 3. If in cache: slides window forward, evicts files outside [current-1, current+10] to maintain <= 12 episodes.
// 4. Concurrently prefetches the upcoming 10 episodes in background until the series ends.
func (sm *StreamManager) ActivateWindow(ctx context.Context, req WindowPlayRequest) WindowStatus {
	sm.window.mu.Lock()
	defer sm.window.mu.Unlock()

	if req.Quality == "" {
		req.Quality = "720p"
	}

	// Update episode list
	if len(req.Episodes) > 0 {
		sm.window.episodes = req.Episodes
		sm.window.seriesID = req.SeriesID
	} else if req.SeriesID != "" && (req.SeriesID != sm.window.seriesID || len(sm.window.episodes) == 0) {
		page, err := sm.client.ListEpisodes(ctx, req.SeriesID, sdk.EpisodeOptions{})
		if err == nil && page != nil {
			items := make([]EpisodeItem, len(page.Items))
			for i, ep := range page.Items {
				items[i] = EpisodeItem{ID: ep.ID, Number: ep.Number, Title: ep.Title}
			}
			sm.window.episodes = items
			sm.window.seriesID = req.SeriesID
		}
	}

	// Find index of the requested episode
	idx := -1
	for i, ep := range sm.window.episodes {
		if ep.ID == req.EpisodeID {
			idx = i
			break
		}
	}
	if idx == -1 && len(sm.window.episodes) > 0 {
		idx = 0
		req.EpisodeID = sm.window.episodes[0].ID
	}

	currentEpNum := idx + 1
	if idx >= 0 && idx < len(sm.window.episodes) {
		currentEpNum = sm.window.episodes[idx].Number
	}

	// Check if current episode is in cache
	isCached := sm.IsEpisodeCached(req.EpisodeID, req.Quality)

	if !isCached {
		// 跳级且不在缓存中：清空并重新填充
		if sm.window.cancelPrefetch != nil {
			sm.window.cancelPrefetch()
			sm.window.cancelPrefetch = nil
		}
		_ = sm.ClearCache()
		sm.window.lastEvent = "jump_cleared_refilling"
	} else {
		// 在缓存中（包括顺序播放下一集）：保持缓存，平移滑动窗口
		if sm.window.cancelPrefetch != nil {
			sm.window.cancelPrefetch()
			sm.window.cancelPrefetch = nil
		}
		sm.window.lastEvent = "in_cache_slide"
	}

	sm.window.currentEpID = req.EpisodeID
	sm.window.currentEpIndex = idx
	sm.window.quality = req.Quality

	// Calculate desired keep window (maximum 12 episodes total)
	// Window contains:
	// - current episode: idx
	// - previous episode: idx-1 (if exists, kept so back-button is instant)
	// - upcoming 10 episodes: idx+1 ... min(idx+10, len(episodes)-1)
	keepMap := make(map[string]bool)
	if idx >= 0 && idx < len(sm.window.episodes) {
		keepMap[sm.window.episodes[idx].ID] = true
	}
	if idx > 0 && idx-1 < len(sm.window.episodes) {
		keepMap[sm.window.episodes[idx-1].ID] = true
	}
	// Add forward episodes up to PrefetchCount (10)
	for i := idx + 1; i < len(sm.window.episodes) && len(keepMap) < MaxCachedEpisodes; i++ {
		keepMap[sm.window.episodes[i].ID] = true
	}
	// If room remains (e.g. at ep 1), keep up to MaxCachedEpisodes forward
	for i := idx + 1; i < len(sm.window.episodes) && len(keepMap) < MaxCachedEpisodes; i++ {
		keepMap[sm.window.episodes[i].ID] = true
	}

	// Enforce maximum 12 episodes limit on disk
	sm.enforceLimitLocked(keepMap, req.Quality)

	// Build queue of upcoming episodes to prefetch in background (up to 10 episodes)
	var queue []EpisodeItem
	for i := idx + 1; i < len(sm.window.episodes) && i <= idx+PrefetchCount; i++ {
		ep := sm.window.episodes[i]
		if !sm.IsEpisodeCached(ep.ID, req.Quality) {
			queue = append(queue, ep)
		}
	}

	// Launch background prefetcher
	if len(queue) > 0 {
		prefetchCtx, cancel := context.WithCancel(context.Background())
		sm.window.cancelPrefetch = cancel
		sm.window.isPrefetching = true
		go sm.runPrefetchQueue(prefetchCtx, queue, req.Quality, keepMap)
	} else {
		sm.window.isPrefetching = false
	}

	return sm.buildStatusLocked(req.SeriesID, req.Quality, currentEpNum)
}

func (sm *StreamManager) runPrefetchQueue(ctx context.Context, queue []EpisodeItem, quality string, keepMap map[string]bool) {
	defer func() {
		sm.window.mu.Lock()
		sm.window.isPrefetching = false
		sm.window.mu.Unlock()
	}()

	for _, ep := range queue {
		select {
		case <-ctx.Done():
			return
		default:
		}

		// Cache episode
		_, err := sm.EnsureCached(ctx, ep.ID, quality)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return
			}
			// Skip to next on failure
			continue
		}

		// Enforce limit after each prefetch
		sm.window.mu.Lock()
		sm.enforceLimitLocked(keepMap, quality)
		sm.window.mu.Unlock()
	}
}

// enforceLimitLocked deletes cached files not in keepMap or matching different quality.
func (sm *StreamManager) enforceLimitLocked(keepMap map[string]bool, quality string) {
	entries, err := os.ReadDir(sm.cacheDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(name, ".mp4") {
			continue
		}
		base := strings.TrimSuffix(name, ".mp4")
		parts := strings.Split(base, "_")
		if len(parts) >= 2 {
			epID := strings.Join(parts[:len(parts)-1], "_")
			fileQuality := parts[len(parts)-1]
			if fileQuality != quality || !keepMap[epID] {
				_ = os.Remove(filepath.Join(sm.cacheDir, name))
			}
		}
	}
}

func (sm *StreamManager) buildStatusLocked(seriesID, quality string, currentEpNum int) WindowStatus {
	var cachedIDs []string
	var cachedNums []int

	epNumMap := make(map[string]int)
	for _, ep := range sm.window.episodes {
		epNumMap[ep.ID] = ep.Number
	}

	entries, _ := os.ReadDir(sm.cacheDir)
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".mp4") {
			base := strings.TrimSuffix(e.Name(), ".mp4")
			parts := strings.Split(base, "_")
			if len(parts) >= 2 {
				epID := strings.Join(parts[:len(parts)-1], "_")
				q := parts[len(parts)-1]
				if q == quality {
					cachedIDs = append(cachedIDs, epID)
					if num, ok := epNumMap[epID]; ok {
						cachedNums = append(cachedNums, num)
					}
				}
			}
		}
	}

	return WindowStatus{
		SeriesID:      seriesID,
		CurrentEpID:   sm.window.currentEpID,
		CurrentEpNum:  currentEpNum,
		Quality:       quality,
		MaxCached:     MaxCachedEpisodes,
		PrefetchCount: PrefetchCount,
		CachedEpIDs:   cachedIDs,
		CachedEpNums:  cachedNums,
		TotalCached:   len(cachedIDs),
		IsPrefetching: sm.window.isPrefetching,
		LastEvent:     sm.window.lastEvent,
	}
}

// GetWindowStatus returns current cache window information.
func (sm *StreamManager) GetWindowStatus(seriesID, quality string) WindowStatus {
	sm.window.mu.Lock()
	defer sm.window.mu.Unlock()

	currentEpNum := sm.window.currentEpIndex + 1
	if sm.window.currentEpIndex >= 0 && sm.window.currentEpIndex < len(sm.window.episodes) {
		currentEpNum = sm.window.episodes[sm.window.currentEpIndex].Number
	}
	if quality == "" {
		quality = sm.window.quality
	}
	if quality == "" {
		quality = "720p"
	}
	return sm.buildStatusLocked(seriesID, quality, currentEpNum)
}

// ServeStream handles the HTTP request by serving the cached file with byte-range support.
func (sm *StreamManager) ServeStream(w http.ResponseWriter, r *http.Request, episodeID, quality string) {
	target, err := sm.EnsureCached(r.Context(), episodeID, quality)
	if err != nil {
		http.Error(w, fmt.Sprintf("Stream error: %v", err), http.StatusInternalServerError)
		return
	}

	file, err := os.Open(target)
	if err != nil {
		http.Error(w, "Cannot open stream file", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	fi, err := file.Stat()
	if err != nil {
		http.Error(w, "Cannot stat stream file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Accept-Ranges", "bytes")
	http.ServeContent(w, r, filepath.Base(target), fi.ModTime(), file)
}

// Prefetch triggers background caching of the given episode.
func (sm *StreamManager) Prefetch(episodeID, quality string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		_, _ = sm.EnsureCached(ctx, episodeID, quality)
	}()
}

// CacheStats returns cache metrics.
type CacheStats struct {
	TotalBytes int64  `json:"total_bytes"`
	FileCount  int    `json:"file_count"`
	Path       string `json:"path"`
}

// Stats returns information about cached media.
func (sm *StreamManager) Stats() CacheStats {
	var total int64
	var count int
	entries, _ := os.ReadDir(sm.cacheDir)
	for _, e := range entries {
		if !e.IsDir() {
			if info, err := e.Info(); err == nil {
				total += info.Size()
				count++
			}
		}
	}
	return CacheStats{
		TotalBytes: total,
		FileCount:  count,
		Path:       sm.cacheDir,
	}
}

// ClearCache removes all files in cache directory.
func (sm *StreamManager) ClearCache() error {
	entries, err := os.ReadDir(sm.cacheDir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if !e.IsDir() {
			_ = os.Remove(filepath.Join(sm.cacheDir, e.Name()))
		}
	}
	return nil
}
