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
	"sync"
	"time"

	"github.com/beilunyang/openhongguo/sdk"
)

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
