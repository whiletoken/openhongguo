package webserver

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/beilunyang/openhongguo/server/internal/favorite"
)

func TestHandleFavorites(t *testing.T) {
	favStore := favorite.NewStore(filepath.Join(t.TempDir(), "favorites.json"))
	srv := &Server{
		favoriteStore: favStore,
	}

	// 1. Initial list should be empty
	req := httptest.NewRequest(http.MethodGet, "/api/favorites", nil)
	w := httptest.NewRecorder()
	srv.handleFavorites(w, req)
	if w.Result().StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Result().StatusCode)
	}
	var list []favorite.Entry
	if err := json.NewDecoder(w.Result().Body).Decode(&list); err != nil || len(list) != 0 {
		t.Fatalf("expected empty list, got err=%v list=%+v", err, list)
	}

	// 2. Add a favorite
	entry := favorite.Entry{
		SeriesID:     "7001",
		Title:        "测试短剧",
		CoverURL:     "https://example.com/cover.jpg",
		EpisodeCount: 80,
		Heat:         99999,
		CreatedAt:    time.Now().UTC(),
	}
	body, _ := json.Marshal(entry)
	req = httptest.NewRequest(http.MethodPost, "/api/favorites", bytes.NewReader(body))
	w = httptest.NewRecorder()
	srv.handleFavorites(w, req)
	if w.Result().StatusCode != http.StatusOK {
		t.Fatalf("post expected 200, got %d: %s", w.Result().StatusCode, w.Body.String())
	}

	// 3. Query specific ID
	req = httptest.NewRequest(http.MethodGet, "/api/favorites?id=7001", nil)
	w = httptest.NewRecorder()
	srv.handleFavorites(w, req)
	if w.Result().StatusCode != http.StatusOK {
		t.Fatalf("get by id expected 200, got %d", w.Result().StatusCode)
	}
	var res map[string]any
	if err := json.NewDecoder(w.Result().Body).Decode(&res); err != nil {
		t.Fatal(err)
	}
	if res["favorited"] != true {
		t.Fatalf("expected favorited=true, got %v", res)
	}

	// 4. Delete by ID
	req = httptest.NewRequest(http.MethodDelete, "/api/favorites?id=7001", nil)
	w = httptest.NewRecorder()
	srv.handleFavorites(w, req)
	if w.Result().StatusCode != http.StatusOK {
		t.Fatalf("delete expected 200, got %d", w.Result().StatusCode)
	}

	// Verify it's removed
	req = httptest.NewRequest(http.MethodGet, "/api/favorites?id=7001", nil)
	w = httptest.NewRecorder()
	srv.handleFavorites(w, req)
	var resAfter map[string]any
	_ = json.NewDecoder(w.Result().Body).Decode(&resAfter)
	if resAfter["favorited"] == true {
		t.Fatalf("expected favorited=false after delete")
	}
}
