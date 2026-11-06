package webserver

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/beilunyang/openhongguo/internal/favorite"
)

// handleFavorites handles reading, adding, removing, and clearing favorite series.
func (s *Server) handleFavorites(w http.ResponseWriter, r *http.Request) {
	if s.favoriteStore == nil {
		jsonError(w, http.StatusServiceUnavailable, "favorite store not configured")
		return
	}

	switch r.Method {
	case http.MethodGet:
		// If specific id is queried: /api/favorites?id=...
		seriesID := r.URL.Query().Get("id")
		if seriesID != "" {
			entry, ok, err := s.favoriteStore.Get(r.Context(), seriesID)
			if err != nil {
				jsonError(w, http.StatusInternalServerError, err.Error())
				return
			}
			jsonResponse(w, http.StatusOK, map[string]any{
				"favorited": ok,
				"entry":     entry,
			})
			return
		}

		list, err := s.favoriteStore.List(r.Context())
		if err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if list == nil {
			list = []favorite.Entry{}
		}
		jsonResponse(w, http.StatusOK, list)

	case http.MethodPost:
		var entry favorite.Entry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid json")
			return
		}
		if entry.SeriesID == "" {
			jsonError(w, http.StatusBadRequest, "series_id is required")
			return
		}
		if entry.CreatedAt.IsZero() {
			entry.CreatedAt = time.Now()
		}
		if err := s.favoriteStore.Add(r.Context(), entry); err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
		jsonResponse(w, http.StatusOK, map[string]any{
			"saved": true,
			"entry": entry,
		})

	case http.MethodDelete:
		seriesID := r.URL.Query().Get("id")
		if seriesID == "" {
			seriesID = r.URL.Query().Get("series_id")
		}
		clearAll := r.URL.Query().Get("clear") == "true" || r.URL.Query().Get("clear") == "all"

		if seriesID != "" {
			if err := s.favoriteStore.Remove(r.Context(), seriesID); err != nil {
				jsonError(w, http.StatusInternalServerError, err.Error())
				return
			}
			jsonResponse(w, http.StatusOK, map[string]bool{"removed": true})
			return
		}

		if clearAll {
			if err := s.favoriteStore.Clear(r.Context()); err != nil {
				jsonError(w, http.StatusInternalServerError, err.Error())
				return
			}
			jsonResponse(w, http.StatusOK, map[string]bool{"cleared": true})
			return
		}

		jsonError(w, http.StatusBadRequest, "missing 'id' or 'clear=true' parameter")

	default:
		jsonError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}
