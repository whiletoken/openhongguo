package webserver

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/beilunyang/openhongguo/sdk"
	"github.com/beilunyang/openhongguo/sdk/model"
	"github.com/whiletoken/openhongguo/server/internal/logger"
)

func executeWithRetry[T any](ctx context.Context, s *Server, fn func() (T, error)) (T, error) {
	val, err := fn()
	if err != nil && isGuestRegistrationError(err) {
		logger.Warnf("检测到匿名设备注册未就绪或身份异常 (%v)，正在自动重置设备并重试...", err)
		if resetErr := s.client.ResetDevice(ctx); resetErr == nil {
			return fn()
		} else {
			logger.Errorf("自动重置匿名设备失败: %v", resetErr)
		}
	}
	return val, err
}

func isGuestRegistrationError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "no guest identity") ||
		strings.Contains(msg, "anonymous registration") ||
		strings.Contains(msg, "guest ticket missing")
}

// handleDiscover handles catalog channel feed requests.
func (s *Server) handleDiscover(w http.ResponseWriter, r *http.Request) {
	channel := r.URL.Query().Get("channel")
	cursor := r.URL.Query().Get("cursor")

	page, err := executeWithRetry(r.Context(), s, func() (*sdk.Page[model.SeriesSummary], error) {
		return s.client.Discover(r.Context(), sdk.DiscoverOptions{
			Channel: channel,
			Cursor:  cursor,
		})
	})
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, page)
}

// handleSearch handles drama search requests.
func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		jsonError(w, http.StatusBadRequest, "search query is required")
		return
	}
	cursor := r.URL.Query().Get("cursor")
	filter := r.URL.Query().Get("filter")

	var filters []string
	if filter != "" {
		filters = strings.Split(filter, ",")
	}

	page, err := executeWithRetry(r.Context(), s, func() (*sdk.Page[model.SeriesSummary], error) {
		return s.client.Search(r.Context(), q, sdk.SearchOptions{
			Cursor:  cursor,
			Filters: filters,
		})
	})
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, page)
}

// handleSeries returns series detail information.
func (s *Server) handleSeries(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		jsonError(w, http.StatusBadRequest, "series id is required")
		return
	}
	series, err := executeWithRetry(r.Context(), s, func() (*model.Series, error) {
		return s.client.GetSeries(r.Context(), id)
	})
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, series)
}

// handleEpisodes returns the episodes list for a series.
func (s *Server) handleEpisodes(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		jsonError(w, http.StatusBadRequest, "series id is required")
		return
	}
	episodes, err := executeWithRetry(r.Context(), s, func() (*sdk.Page[model.Episode], error) {
		return s.client.ListEpisodes(r.Context(), id, sdk.EpisodeOptions{})
	})
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, episodes)
}

// PlaybackResponse models the JSON payload returned by /api/playback.
type PlaybackResponse struct {
	EpisodeID       string         `json:"episode_id"`
	DurationSeconds int            `json:"duration_seconds"`
	Protected       bool           `json:"protected"`
	Streams         []model.Stream `json:"streams"`
	StreamURL       string         `json:"stream_url"`
	ContentKey      string         `json:"content_key,omitempty"`
}

// handlePlayback returns stream URLs, DRM keys and metadata for an episode.
func (s *Server) handlePlayback(w http.ResponseWriter, r *http.Request) {
	episodeID := strings.TrimSpace(r.URL.Query().Get("episode_id"))
	if episodeID == "" {
		jsonError(w, http.StatusBadRequest, "episode_id is required")
		return
	}

	pb, err := executeWithRetry(r.Context(), s, func() (*model.Playback, error) {
		return s.client.ResolvePlayback(r.Context(), episodeID, sdk.PlaybackOptions{})
	})
	if err != nil && !errors.Is(err, sdk.ErrDRMProtected) {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if pb == nil {
		jsonError(w, http.StatusNotFound, "playback information not found")
		return
	}

	var keyHex string
	if pb.Protected {
		k, kErr := sdk.ContentKey(pb)
		if kErr == nil {
			keyHex = k.Hex
		}
	}

	resp := PlaybackResponse{
		EpisodeID:       pb.EpisodeID,
		DurationSeconds: pb.DurationSeconds,
		Protected:       pb.Protected,
		Streams:         pb.Streams,
		StreamURL:       fmt.Sprintf("/api/stream?episode_id=%s", pb.EpisodeID),
		ContentKey:      keyHex,
	}

	jsonResponse(w, http.StatusOK, resp)
}

// handleDanmaku returns the bullet comments (danmaku) for an episode.
func (s *Server) handleDanmaku(w http.ResponseWriter, r *http.Request) {
	seriesID := r.URL.Query().Get("series_id")
	episodeID := r.URL.Query().Get("episode_id")
	if seriesID == "" || episodeID == "" {
		jsonError(w, http.StatusBadRequest, "series_id and episode_id are required")
		return
	}
	cursor := r.URL.Query().Get("cursor")
	startMsStr := r.URL.Query().Get("start_ms")
	var startMs int64
	if startMsStr != "" {
		startMs, _ = strconv.ParseInt(startMsStr, 10, 64)
	}

	page, err := executeWithRetry(r.Context(), s, func() (*model.DanmakuPage, error) {
		return s.client.ListDanmaku(r.Context(), seriesID, episodeID, sdk.DanmakuOptions{
			Cursor:  cursor,
			StartMs: startMs,
		})
	})
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, page)
}
