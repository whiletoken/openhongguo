package webserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/beilunyang/openhongguo/internal/history"
	"github.com/beilunyang/openhongguo/internal/media"
	"github.com/beilunyang/openhongguo/sdk"
	"github.com/beilunyang/openhongguo/sdk/model"
)

// Server handles Web UI requests and REST APIs.
type Server struct {
	client       *sdk.Client
	historyStore *history.Store
	streamMgr    *StreamManager
	tools        ToolsInfo
	mediaLaunch  *media.Launcher
	staticFS     fs.FS
}

// Config holds configuration for creating a Server.
type Config struct {
	Client       *sdk.Client
	HistoryStore *history.Store
	CacheDir     string
	StaticFS     fs.FS
}

// NewServer creates a new Web server instance.
func NewServer(cfg Config) (*Server, error) {
	tools := DetectTools()

	streamMgr, err := NewStreamManager(cfg.Client, cfg.CacheDir, tools.FFmpegPath)
	if err != nil {
		return nil, err
	}

	launcher := media.New()
	launcher.LookPath = func(file string) (string, error) {
		switch file {
		case "ffmpeg":
			if tools.FFmpegPath != "" {
				return tools.FFmpegPath, nil
			}
		case "ffplay":
			if tools.FFplayPath != "" {
				return tools.FFplayPath, nil
			}
		case "mpv":
			if tools.MpvPath != "" {
				return tools.MpvPath, nil
			}
		case "vlc":
			if tools.VlcPath != "" {
				return tools.VlcPath, nil
			}
		}
		return exec.LookPath(file)
	}

	return &Server{
		client:       cfg.Client,
		historyStore: cfg.HistoryStore,
		streamMgr:    streamMgr,
		tools:        tools,
		mediaLaunch:  launcher,
		staticFS:     cfg.StaticFS,
	}, nil
}

// Handler returns the HTTP handler with all routes configured.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/system/status", s.handleSystemStatus)
	mux.HandleFunc("/api/discover", s.handleDiscover)
	mux.HandleFunc("/api/search", s.handleSearch)
	mux.HandleFunc("/api/series", s.handleSeries)
	mux.HandleFunc("/api/episodes", s.handleEpisodes)
	mux.HandleFunc("/api/playback", s.handlePlayback)
	mux.HandleFunc("/api/stream", s.handleStream)
	mux.HandleFunc("/api/cache/active", s.handleActiveCache)
	mux.HandleFunc("/api/cache/window", s.handleCacheWindow)
	mux.HandleFunc("/api/play_external", s.handlePlayExternal)
	mux.HandleFunc("/api/history", s.handleHistory)
	mux.HandleFunc("/api/cache/clear", s.handleClearCache)
	mux.HandleFunc("/api/download", s.handleDownload)

	// Static assets
	if s.staticFS != nil {
		fileServer := http.FileServer(http.FS(s.staticFS))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				http.NotFound(w, r)
				return
			}
			// Cache control for static assets
			if strings.HasSuffix(r.URL.Path, ".css") || strings.HasSuffix(r.URL.Path, ".js") {
				w.Header().Set("Cache-Control", "no-cache")
			}
			fileServer.ServeHTTP(w, r)
		})
	}

	return corsMiddleware(mux)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Range")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func jsonResponse(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, status int, msg string) {
	jsonResponse(w, status, map[string]string{"error": msg})
}

func (s *Server) handleSystemStatus(w http.ResponseWriter, r *http.Request) {
	tools := DetectTools()
	stats := s.streamMgr.Stats()
	jsonResponse(w, http.StatusOK, map[string]any{
		"tools": tools,
		"cache": stats,
	})
}

func (s *Server) handleDiscover(w http.ResponseWriter, r *http.Request) {
	channel := r.URL.Query().Get("channel")
	cursor := r.URL.Query().Get("cursor")

	page, err := s.client.Discover(r.Context(), sdk.DiscoverOptions{
		Channel: channel,
		Cursor:  cursor,
	})
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, page)
}

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

	page, err := s.client.Search(r.Context(), q, sdk.SearchOptions{
		Cursor:  cursor,
		Filters: filters,
	})
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, page)
}

func (s *Server) handleSeries(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		jsonError(w, http.StatusBadRequest, "series id is required")
		return
	}
	series, err := s.client.GetSeries(r.Context(), id)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, series)
}

func (s *Server) handleEpisodes(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		jsonError(w, http.StatusBadRequest, "series id is required")
		return
	}
	episodes, err := s.client.ListEpisodes(r.Context(), id, sdk.EpisodeOptions{})
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, episodes)
}

type PlaybackResponse struct {
	EpisodeID       string         `json:"episode_id"`
	DurationSeconds int            `json:"duration_seconds"`
	Protected       bool           `json:"protected"`
	Streams         []model.Stream `json:"streams"`
	StreamURL       string         `json:"stream_url"`
	ContentKey      string         `json:"content_key,omitempty"`
}

func (s *Server) handlePlayback(w http.ResponseWriter, r *http.Request) {
	episodeID := strings.TrimSpace(r.URL.Query().Get("episode_id"))
	if episodeID == "" {
		jsonError(w, http.StatusBadRequest, "episode_id is required")
		return
	}

	pb, err := s.client.ResolvePlayback(r.Context(), episodeID, sdk.PlaybackOptions{})
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

func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	episodeID := strings.TrimSpace(r.URL.Query().Get("episode_id"))
	quality := strings.TrimSpace(r.URL.Query().Get("quality"))
	seriesID := strings.TrimSpace(r.URL.Query().Get("series_id"))
	if episodeID == "" {
		http.Error(w, "missing episode_id", http.StatusBadRequest)
		return
	}

	if seriesID != "" {
		s.streamMgr.ActivateWindow(r.Context(), WindowPlayRequest{
			SeriesID:  seriesID,
			EpisodeID: episodeID,
			Quality:   quality,
		})
	}

	s.streamMgr.ServeStream(w, r, episodeID, quality)
}

func (s *Server) handleActiveCache(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "POST required")
		return
	}
	var req WindowPlayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.EpisodeID == "" {
		jsonError(w, http.StatusBadRequest, "episode_id is required")
		return
	}
	status := s.streamMgr.ActivateWindow(r.Context(), req)
	jsonResponse(w, http.StatusOK, status)
}

func (s *Server) handleCacheWindow(w http.ResponseWriter, r *http.Request) {
	seriesID := strings.TrimSpace(r.URL.Query().Get("series_id"))
	quality := strings.TrimSpace(r.URL.Query().Get("quality"))
	status := s.streamMgr.GetWindowStatus(seriesID, quality)
	jsonResponse(w, http.StatusOK, status)
}

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	episodeID := strings.TrimSpace(r.URL.Query().Get("episode_id"))
	quality := strings.TrimSpace(r.URL.Query().Get("quality"))
	filename := strings.TrimSpace(r.URL.Query().Get("filename"))
	if episodeID == "" {
		http.Error(w, "missing episode_id", http.StatusBadRequest)
		return
	}
	if filename == "" {
		filename = fmt.Sprintf("episode_%s.mp4", episodeID)
	}
	if !strings.HasSuffix(filename, ".mp4") {
		filename += ".mp4"
	}

	target, err := s.streamMgr.EnsureCached(r.Context(), episodeID, quality)
	if err != nil {
		http.Error(w, fmt.Sprintf("Download prepare error: %v", err), http.StatusInternalServerError)
		return
	}

	file, err := os.Open(target)
	if err != nil {
		http.Error(w, "Cannot open cached file", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	fi, _ := file.Stat()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	if fi != nil {
		w.Header().Set("Content-Length", strconv.FormatInt(fi.Size(), 10))
	}
	_, _ = io.Copy(w, file)
}

type PlayExternalRequest struct {
	EpisodeID    string `json:"episode_id"`
	Player       string `json:"player"`
	Quality      string `json:"quality"`
	StartSeconds int    `json:"start_seconds"`
}

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

func (s *Server) handleClearCache(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "POST required")
		return
	}
	if err := s.streamMgr.ClearCache(); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]bool{"cleared": true})
}
