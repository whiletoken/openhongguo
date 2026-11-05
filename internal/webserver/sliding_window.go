package webserver

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/beilunyang/openhongguo/sdk"
)

const (
	// MaxCachedEpisodes limits local cache to 12 episodes max.
	MaxCachedEpisodes = 12
	// PrefetchCount automatically pre-downloads upcoming 10 episodes.
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

// ActivateWindow updates the active series/episode and manages the sliding cache window.
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
	} else if req.SeriesID != "" && sm.client != nil && (req.SeriesID != sm.window.seriesID || len(sm.window.episodes) == 0) {
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

	// Locate index of current episode
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
		// Jump to non-cached episode: clear cache and refill
		if sm.window.cancelPrefetch != nil {
			sm.window.cancelPrefetch()
			sm.window.cancelPrefetch = nil
		}
		_ = sm.ClearCache()
		sm.window.lastEvent = "jump_cleared_refilling"
	} else {
		// Playing cached episode: keep cache, slide window forward
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
