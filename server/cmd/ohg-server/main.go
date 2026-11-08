package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/beilunyang/openhongguo/server/adapters"
	"github.com/beilunyang/openhongguo/server/adapters/filestore"
	"github.com/beilunyang/openhongguo/server/internal/favorite"
	"github.com/beilunyang/openhongguo/server/internal/history"
	"github.com/beilunyang/openhongguo/server/internal/logger"
	"github.com/beilunyang/openhongguo/server/internal/webserver"
	"github.com/beilunyang/openhongguo/server/sdk"
	"github.com/beilunyang/openhongguo/web"
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	defaultAddr := envOr("OHG_ADDR", "0.0.0.0")
	defaultPortStr := envOr("OHG_PORT", "5210")
	defaultPort, _ := strconv.Atoi(defaultPortStr)
	if defaultPort <= 0 {
		defaultPort = 5210
	}

	addr := flag.String("addr", defaultAddr, "HTTP service bind address (0.0.0.0 for all interfaces)")
	port := flag.Int("port", defaultPort, "HTTP service listening port")
	open := flag.Bool("open", false, "Open browser automatically on start (default false for server)")
	configDir := flag.String("config-dir", envOr("OHG_CONFIG_DIR", ""), "Configuration and anonymous profile directory")
	cacheDir := flag.String("cache-dir", envOr("OHG_CACHE_DIR", ""), "Media stream decryption and cache directory")
	webDir := flag.String("web-dir", envOr("OHG_WEB_DIR", ""), "Optional external directory to serve web assets from")
	logLevel := flag.String("log-level", envOr("OHG_LOG_LEVEL", "info"), "Log level (debug, info, warn, error)")
	logDir := flag.String("log-dir", envOr("OHG_LOG_DIR", ""), "Log output directory (default: <config-dir>/logs)")
	flag.Parse()

	// Locate data directory
	dir := *configDir
	if dir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			base = os.TempDir()
		}
		dir = filepath.Join(base, "openhongguo")
	}
	_ = os.MkdirAll(dir, 0700)

	// Initialize Logger
	logPath := *logDir
	if logPath == "" {
		logPath = filepath.Join(dir, "logs")
	}
	_, err := logger.Init(logger.Config{
		Level:         *logLevel,
		LogDir:        logPath,
		Filename:      "ohg-server.log",
		EnableConsole: true,
		EnableFile:    true,
		MaxSize:       20,
		MaxBackups:    5,
		MaxAge:        14,
		Compress:      true,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "初始化日志系统警告: %v\n", err)
	}
	defer func() {
		_ = logger.Sync()
	}()

	logger.Infof("正在启动 OpenHongguo 服务端, 数据目录: %s, 日志目录: %s, 日志级别: %s", dir, logPath, *logLevel)

	// PID file management: validate PID, remove stale PID or terminate old instance
	pidPath := filepath.Join(dir, "ohg-server.pid")
	pidMgr, err := webserver.AcquirePIDFile(pidPath)
	if err != nil {
		logger.Warnf("PID 互斥管理异常: %v", err)
	} else {
		defer pidMgr.Release()
	}

	// Initialize SDK Client with SmartTransport
	store := filestore.New(filepath.Join(dir, "anonymous.json"))
	client, err := adapters.NewClient("", sdk.Options{
		Transport:          webserver.NewSmartTransport(),
		ProfileStore:       store,
		APIOrigin:          os.Getenv("OHG_API_ORIGIN"),
		RegisterOrigin:     os.Getenv("OHG_REGISTER_ORIGIN"),
		DistributionOrigin: os.Getenv("OHG_DISTRIBUTION_ORIGIN"),
		RetryAttempts:      3,
	})
	if err != nil {
		logger.Errorf("初始化 SDK 客户端失败: %v", err)
		os.Exit(1)
	}

	histStore := history.NewStore(filepath.Join(dir, "history.json"))
	favStore := favorite.NewStore(filepath.Join(dir, "favorites.json"))

	// Web frontend assets
	staticFS := web.Assets()
	if *webDir != "" {
		staticFS = os.DirFS(*webDir)
	}

	// Create Web Server
	srv, err := webserver.NewServer(webserver.Config{
		Client:        client,
		HistoryStore:  histStore,
		FavoriteStore: favStore,
		CacheDir:      *cacheDir,
		StaticFS:      staticFS,
	})
	if err != nil {
		logger.Errorf("初始化服务端失败: %v", err)
		os.Exit(1)
	}

	listenHost := *addr
	listenPort := *port
	if strings.Contains(*addr, ":") {
		if host, p, err := net.SplitHostPort(*addr); err == nil {
			listenHost = host
			if parsedPort, err := strconv.Atoi(p); err == nil {
				listenPort = parsedPort
			}
		}
	}
	listenAddr := fmt.Sprintf("%s:%d", listenHost, listenPort)
	listener, err := net.Listen("tcp", listenAddr)
	if err != nil {
		logger.Errorf("端口监听失败 (%s): %v", listenAddr, err)
		os.Exit(1)
	}

	displayHost := listenHost
	if displayHost == "" || displayHost == "0.0.0.0" {
		displayHost = "127.0.0.1"
	}
	url := fmt.Sprintf("http://%s:%d", displayHost, listenPort)

	httpServer := &http.Server{
		Handler: srv.Handler(),
	}

	logger.SafeGoNamed("http_server", func() {
		if err := httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
			logger.Errorf("服务端运行错误: %v", err)
		}
	})

	fmt.Println("==================================================")
	fmt.Println("  红果短剧 OpenHongguo - 后台 API & Web 服务端")
	fmt.Println("==================================================")
	fmt.Printf(" 服务监听: %s\n", listenAddr)
	fmt.Printf(" 访问地址: %s\n", url)
	fmt.Printf(" 日志文件: %s\n", filepath.Join(logPath, "ohg-server.log"))
	if *addr == "0.0.0.0" {
		fmt.Println(" 局域网访问: 手机/平板/TV 浏览器打开本机局域网 IP:5210 即可观看")
	}
	fmt.Println(" 按 Ctrl+C 优雅停止服务")
	fmt.Println("--------------------------------------------------")

	if *open {
		logger.SafeGoNamed("open_browser", func() {
			openBrowser(url)
		})
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	logger.Info("接收到停止信号，正在关闭服务端...")
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
	if pidMgr != nil {
		pidMgr.Release()
	}
	logger.Info("服务端已安全停止。")
}

func openBrowser(url string) {
	time.Sleep(200 * time.Millisecond)
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}
