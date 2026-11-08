package favorite

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestAddGetListRemoveAndClear(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "favorites.json")
	s := NewStore(path)

	if _, ok, err := s.Get(ctx, "1"); err != nil || ok {
		t.Fatalf("empty get ok=%v err=%v", ok, err)
	}

	older := Entry{
		SeriesID:     "1",
		Title:        "Drama A",
		CoverURL:     "http://example.com/a.jpg",
		EpisodeCount: 10,
		Heat:         1000,
		CreatedAt:    time.Unix(100, 0).UTC(),
	}
	newer := Entry{
		SeriesID:     "2",
		Title:        "Drama B",
		CoverURL:     "http://example.com/b.jpg",
		EpisodeCount: 20,
		Heat:         5000,
		CreatedAt:    time.Unix(200, 0).UTC(),
	}

	for _, e := range []Entry{older, newer} {
		if err := s.Add(ctx, e); err != nil {
			t.Fatal(err)
		}
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0600 {
		t.Fatalf("mode = %v", info.Mode().Perm())
	}

	got, ok, err := NewStore(path).Get(ctx, "1")
	if err != nil || !ok || got.Title != older.Title {
		t.Fatalf("get = %+v ok=%v err=%v", got, ok, err)
	}

	list, err := s.List(ctx)
	if err != nil || len(list) != 2 || list[0].SeriesID != "2" {
		t.Fatalf("list = %+v err=%v", list, err)
	}

	// Update existing entry with zero CreatedAt should set current time
	older.Title, older.CreatedAt = "Drama A Updated", time.Time{}
	if err := s.Add(ctx, older); err != nil {
		t.Fatal(err)
	}
	if got, _, _ := s.Get(ctx, "1"); got.Title != "Drama A Updated" || got.CreatedAt.IsZero() {
		t.Fatalf("updated = %+v", got)
	}

	// Remove single item
	if err := s.Remove(ctx, "1"); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := s.Get(ctx, "1"); ok {
		t.Fatal("expected series 1 to be removed")
	}
	list, err = s.List(ctx)
	if err != nil || len(list) != 1 || list[0].SeriesID != "2" {
		t.Fatalf("after remove list = %+v", list)
	}

	// Clear all
	if err := s.Clear(ctx); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.List(ctx); len(list) != 0 {
		t.Fatalf("after clear = %+v", list)
	}
}

func TestAddRejectsBadEntry(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	s := NewStore(filepath.Join(dir, "favorites.json"))
	if err := s.Add(ctx, Entry{SeriesID: ""}); err == nil {
		t.Fatal("entry without series_id accepted")
	}
	if err := s.Remove(ctx, ""); err == nil {
		t.Fatal("remove without series_id accepted")
	}
}
