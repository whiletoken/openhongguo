// Package favorite persists user-starred short drama series to a local JSON file.
// It is a local JSON file with mode 0600 and holds no account or device data.
package favorite

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Entry represents one favorited series.
type Entry struct {
	SeriesID     string    `json:"series_id"`
	Title        string    `json:"title"`
	CoverURL     string    `json:"cover_url,omitempty"`
	EpisodeCount int       `json:"episode_count,omitempty"`
	Heat         int64     `json:"heat,omitempty"`
	Summary      string    `json:"summary,omitempty"`
	Tags         []string  `json:"tags,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// Store keeps favorite entries in one JSON file.
type Store struct {
	path string
	mu   sync.Mutex
}

// NewStore creates a Store backed by path.
func NewStore(path string) *Store { return &Store{path: path} }

// List returns all favorited entries, sorted newest first.
func (s *Store) List(ctx context.Context) ([]Entry, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.load()
	if err != nil {
		return nil, err
	}
	out := make([]Entry, 0, len(all))
	for _, e := range all {
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

// Get returns the favorite entry for seriesID, if it exists.
func (s *Store) Get(ctx context.Context, seriesID string) (Entry, bool, error) {
	if err := ctx.Err(); err != nil {
		return Entry{}, false, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.load()
	if err != nil {
		return Entry{}, false, err
	}
	e, ok := all[seriesID]
	return e, ok, nil
}

// Add adds or updates a favorite entry. If CreatedAt is zero, it is set to now (UTC).
func (s *Store) Add(ctx context.Context, e Entry) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if e.SeriesID == "" {
		return errors.New("favorite entry needs a series ID")
	}
	if e.CreatedAt.IsZero() {
		e.CreatedAt = time.Now().UTC()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.load()
	if err != nil {
		return err
	}
	all[e.SeriesID] = e
	return s.save(all)
}

// Remove deletes a favorite entry by seriesID.
func (s *Store) Remove(ctx context.Context, seriesID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if seriesID == "" {
		return errors.New("series ID is required to remove favorite")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.load()
	if err != nil {
		return err
	}
	if _, ok := all[seriesID]; !ok {
		return nil
	}
	delete(all, seriesID)
	return s.save(all)
}

// Clear removes all favorites.
func (s *Store) Clear(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := rejectSymlink(s.path); err != nil {
		return err
	}
	err := os.Remove(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (s *Store) load() (map[string]Entry, error) {
	if err := rejectSymlink(s.path); err != nil {
		return nil, err
	}
	all := map[string]Entry{}
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return all, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, &all); err != nil {
		return nil, fmt.Errorf("favorites file is corrupt: %w", err)
	}
	return all, nil
}

func (s *Store) save(all map[string]Entry) error {
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".ohg-fav-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	enc := json.NewEncoder(tmp)
	enc.SetIndent("", "  ")
	if err := enc.Encode(all); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(name, s.path)
}

func rejectSymlink(path string) error {
	if path == "" {
		return errors.New("favorites path is empty")
	}
	info, err := os.Lstat(path)
	if err == nil && info.Mode()&os.ModeSymlink != 0 {
		return errors.New("favorites path is a symlink")
	}
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
