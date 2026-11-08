package webserver

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestSlidingWindowCache(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "ohg-test-sliding-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	sm, err := NewStreamManager(nil, tmpDir, "")
	if err != nil {
		t.Fatalf("NewStreamManager failed: %v", err)
	}

	// Create a mock series of 30 episodes
	seriesID := "series_test_1"
	quality := "720p"
	episodes := make([]EpisodeItem, 30)
	for i := 0; i < 30; i++ {
		episodes[i] = EpisodeItem{
			ID:     fmt.Sprintf("ep_%d", i+1),
			Number: i + 1,
			Title:  fmt.Sprintf("第 %d 集", i+1),
		}
	}

	// Helper to simulate a cached file on disk
	mockCacheFile := func(epID string) {
		p := sm.CachePath(epID, quality)
		_ = os.WriteFile(p, []byte("dummy video content"), 0644)
	}

	// 1. Initial play: Ep 1 is NOT cached.
	// Expect: cache cleared, window set to ep 1.
	status := sm.ActivateWindow(context.Background(), WindowPlayRequest{
		SeriesID:  seriesID,
		EpisodeID: "ep_1",
		Quality:   quality,
		Episodes:  episodes,
	})

	if status.LastEvent != "jump_cleared_refilling" {
		t.Errorf("expected jump_cleared_refilling, got %s", status.LastEvent)
	}

	// Now simulate that Ep 1 and its upcoming 10 episodes (ep_1 ... ep_11) finished caching
	for i := 1; i <= 11; i++ {
		mockCacheFile(fmt.Sprintf("ep_%d", i))
	}

	// Verify status
	status = sm.GetWindowStatus(seriesID, quality)
	if status.TotalCached != 11 {
		t.Errorf("expected 11 cached episodes, got %d", status.TotalCached)
	}

	// 2. Play next episode: Ep 2 (which is in cache!)
	// Expect: in-cache slide, no clear!
	status = sm.ActivateWindow(context.Background(), WindowPlayRequest{
		SeriesID:  seriesID,
		EpisodeID: "ep_2",
		Quality:   quality,
		Episodes:  episodes,
	})

	if status.LastEvent != "in_cache_slide" {
		t.Errorf("expected in_cache_slide, got %s", status.LastEvent)
	}
	// Ep 1 (previous) should be kept, Ep 2..11 kept. Total <= 12.
	if !sm.IsEpisodeCached("ep_1", quality) {
		t.Errorf("expected previous episode ep_1 to be kept in cache")
	}

	// Now simulate Ep 12 also gets cached (now 12 episodes: 1..12)
	mockCacheFile("ep_12")

	// 3. Play Ep 4 (in cache)
	// Window centered at Ep 4:
	// keep previous: Ep 3
	// keep current: Ep 4
	// keep next: Ep 5..14 (up to 10 forward)
	// Ep 1 and Ep 2 are now OUTSIDE the window of 12 episodes!
	// Expect: Ep 1 and Ep 2 MUST be deleted from disk!
	status = sm.ActivateWindow(context.Background(), WindowPlayRequest{
		SeriesID:  seriesID,
		EpisodeID: "ep_4",
		Quality:   quality,
		Episodes:  episodes,
	})

	if status.LastEvent != "in_cache_slide" {
		t.Errorf("expected in_cache_slide, got %s", status.LastEvent)
	}

	if sm.IsEpisodeCached("ep_1", quality) {
		t.Errorf("ep_1 should have been evicted to keep max 12 window!")
	}
	if sm.IsEpisodeCached("ep_2", quality) {
		t.Errorf("ep_2 should have been evicted to keep max 12 window!")
	}
	if !sm.IsEpisodeCached("ep_3", quality) {
		t.Errorf("ep_3 (previous) should be kept in cache")
	}
	if !sm.IsEpisodeCached("ep_4", quality) {
		t.Errorf("ep_4 (current) should be kept in cache")
	}

	// Count total files on disk
	entries, _ := os.ReadDir(tmpDir)
	var mp4Count int
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".mp4" {
			mp4Count++
		}
	}
	if mp4Count > MaxCachedEpisodes {
		t.Errorf("disk files exceeded MaxCachedEpisodes (%d): got %d", MaxCachedEpisodes, mp4Count)
	}

	// 4. JUMP TEST: user jumps to Ep 25 (NOT in cache)
	// Expect: completely clears old cache files (ep_3..ep_12), refills from Ep 25!
	status = sm.ActivateWindow(context.Background(), WindowPlayRequest{
		SeriesID:  seriesID,
		EpisodeID: "ep_25",
		Quality:   quality,
		Episodes:  episodes,
	})

	if status.LastEvent != "jump_cleared_refilling" {
		t.Errorf("expected jump_cleared_refilling on jump to uncached episode, got %s", status.LastEvent)
	}

	// All old files (ep_3, ep_4...) must be gone!
	if sm.IsEpisodeCached("ep_3", quality) || sm.IsEpisodeCached("ep_4", quality) {
		t.Errorf("old files should be completely cleared upon uncached jump!")
	}

	entriesAfterJump, _ := os.ReadDir(tmpDir)
	var mp4CountAfter int
	for _, e := range entriesAfterJump {
		if filepath.Ext(e.Name()) == ".mp4" {
			mp4CountAfter++
		}
	}
	if mp4CountAfter != 0 {
		t.Errorf("expected 0 files after uncached jump, got %d", mp4CountAfter)
	}
}
