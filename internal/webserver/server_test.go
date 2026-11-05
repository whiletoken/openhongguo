package webserver

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDetectTools(t *testing.T) {
	info := DetectTools()
	t.Logf("Tools detected: ffmpeg=%v, ffplay=%v, edge=%v, chrome=%v, desktop_mode=%v",
		info.FFmpegReady, info.FFplayReady, info.EdgePath != "", info.ChromePath != "", info.DesktopMode)
}

func TestStreamManagerCacheDir(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "ohg-test-cache-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	sm, err := NewStreamManager(nil, tmpDir, "")
	if err != nil {
		t.Fatalf("NewStreamManager failed: %v", err)
	}

	p := sm.CachePath("ep123", "720p")
	if filepath.Base(p) != "ep123_720p.mp4" {
		t.Errorf("unexpected cache path: %s", p)
	}

	stats := sm.Stats()
	if stats.FileCount != 0 || stats.TotalBytes != 0 {
		t.Errorf("expected empty cache stats, got: %+v", stats)
	}
}

func TestSystemStatusHandler(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "ohg-test-cache-*")
	defer os.RemoveAll(tmpDir)

	sm, _ := NewStreamManager(nil, tmpDir, "")
	srv := &Server{
		streamMgr: sm,
	}

	req := httptest.NewRequest(http.MethodGet, "/api/system/status", nil)
	w := httptest.NewRecorder()

	srv.handleSystemStatus(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}

	var data map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		t.Fatalf("failed to decode json: %v", err)
	}

	if _, ok := data["tools"]; !ok {
		t.Error("expected tools in response")
	}
	if _, ok := data["cache"]; !ok {
		t.Error("expected cache in response")
	}
}

func TestStaticMIMETypes(t *testing.T) {
	srv, err := NewServer(Config{
		CacheDir: t.TempDir(),
		StaticFS: EmbeddedAssets(),
	})
	if err != nil {
		t.Fatalf("failed to create server: %v", err)
	}
	handler := srv.Handler()

	req := httptest.NewRequest(http.MethodGet, "/js/app.js", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for /js/app.js, got %d", resp.StatusCode)
	}
	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "javascript") {
		t.Errorf("expected javascript content-type, got: %s", ct)
	}
}

