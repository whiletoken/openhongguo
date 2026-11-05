package webserver

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/beilunyang/openhongguo/internal/history"
	"github.com/beilunyang/openhongguo/internal/media"
	"github.com/beilunyang/openhongguo/sdk"
)

// handleSystemStatus returns environment tools readiness and cache metrics.
func (s *Server) handleSystemStatus(w http.ResponseWriter, r *http.Request) {
	tools := DetectTools()
	stats := s.streamMgr.Stats()
	jsonResponse(w, http.StatusOK, map[string]any{
		"tools": tools,
		"cache": stats,
	})
}

// PlayExternalRequest models the request body for launching an external player.
type PlayExternalRequest struct {
	EpisodeID    string `json:"episode_id"`
	Player       string `json:"player"`
	Quality      string `json:"quality"`
	StartSeconds int    `json:"start_seconds"`
}

// handlePlayExternal launches an external player (MPV, FFplay, VLC) to stream the episode.
func (s *Server) handlePlayExternal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "POST required")
		return
	}
	var req PlayExternalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid json payload")
		return
	}
	if req.EpisodeID == "" {
		jsonError(w, http.StatusBadRequest, "episode_id is required")
		return
	}

	pb, err := s.client.ResolvePlayback(r.Context(), req.EpisodeID, sdk.PlaybackOptions{})
	if err != nil && !errors.Is(err, sdk.ErrDRMProtected) {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if pb == nil {
		jsonError(w, http.StatusNotFound, "playback not found")
		return
	}

	stream, err := pb.Select(req.Quality)
	if err != nil {
		stream, err = pb.Select("best")
		if err != nil {
			jsonError(w, http.StatusInternalServerError, "no valid stream found")
			return
		}
	}

	keyHex := ""
	if pb.Protected {
		k, kErr := sdk.ContentKey(pb)
		if kErr != nil {
			jsonError(w, http.StatusInternalServerError, "content key derive failed: "+kErr.Error())
			return
		}
		keyHex = k.Hex
	}

	player := req.Player
	if player == "" || player == "auto" {
		if s.tools.MpvReady {
			player = "mpv"
		} else if s.tools.FFplayReady {
			player = "ffplay"
		} else if s.tools.VlcReady {
			player = "vlc"
		} else {
			player = "auto"
		}
	}

	// Launch player in background goroutine
	go func() {
		ctx := context.Background()
		_, _ = s.mediaLaunch.Play(ctx, media.Request{
			URL:          stream.URL,
			Audio:        pb.AudioURL,
			Key:          keyHex,
			Player:       player,
			StartSeconds: req.StartSeconds,
		})
	}()

	jsonResponse(w, http.StatusOK, map[string]any{
		"success": true,
		"player":  player,
	})
}

// handleHistory handles reading, recording and clearing watch history.
func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	if s.historyStore == nil {
		jsonError(w, http.StatusServiceUnavailable, "history store not configured")
		return
	}

	switch r.Method {
	case http.MethodGet:
		list, err := s.historyStore.List(r.Context())
		if err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
		jsonResponse(w, http.StatusOK, list)

	case http.MethodPost:
		var entry history.Entry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid json")
			return
		}
		if entry.SeriesID == "" {
			jsonError(w, http.StatusBadRequest, "series_id is required")
			return
		}
		if entry.UpdatedAt.IsZero() {
			entry.UpdatedAt = time.Now()
		}
		if err := s.historyStore.Record(r.Context(), entry); err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
		jsonResponse(w, http.StatusOK, map[string]bool{"saved": true})

	case http.MethodDelete:
		if err := s.historyStore.Clear(r.Context()); err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
		jsonResponse(w, http.StatusOK, map[string]bool{"cleared": true})

	default:
		jsonError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}
