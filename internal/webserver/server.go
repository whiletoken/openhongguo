package webserver

import (
	"io/fs"
	"mime"
	"net/http"
	"os/exec"
	"strings"

	"github.com/beilunyang/openhongguo/internal/favorite"
	"github.com/beilunyang/openhongguo/internal/history"
	"github.com/beilunyang/openhongguo/internal/media"
	"github.com/beilunyang/openhongguo/sdk"
)

func init() {
	_ = mime.AddExtensionType(".js", "application/javascript; charset=utf-8")
	_ = mime.AddExtensionType(".css", "text/css; charset=utf-8")
}

// Server handles Web UI requests and REST APIs.
type Server struct {
	client       *sdk.Client
	historyStore  *history.Store
	favoriteStore *favorite.Store
	streamMgr    *StreamManager
	tools        ToolsInfo
	mediaLaunch  *media.Launcher
	staticFS     fs.FS
}

// Config holds configuration for creating a Server.
type Config struct {
	Client       *sdk.Client
	HistoryStore  *history.Store
	FavoriteStore *favorite.Store
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
		historyStore:  cfg.HistoryStore,
		favoriteStore: cfg.FavoriteStore,
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
	mux.HandleFunc("/api/favorites", s.handleFavorites)
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Range, Authorization, X-Requested-With, Cache-Control")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Content-Type, Content-Disposition")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
