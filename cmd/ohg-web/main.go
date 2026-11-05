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
	"syscall"
	"time"

	"github.com/beilunyang/openhongguo/adapters"
	"github.com/beilunyang/openhongguo/adapters/filestore"
	"github.com/beilunyang/openhongguo/internal/history"
	"github.com/beilunyang/openhongguo/internal/webserver"
	"github.com/beilunyang/openhongguo/sdk"
)

func main() {
	addr := flag.String("addr", "127.0.0.1", "HTTP server bind address (use 0.0.0.0 for LAN access)")
	port := flag.Int("port", 5210, "HTTP server listening port")
	desktop := flag.Bool("desktop", false, "Launch in Windows Desktop App Mode (--app window)")
	open := flag.Bool("open", true, "Open browser automatically on start")
	configDir := flag.String("config-dir", "", "Configuration directory (default user config dir)")
	cacheDir := flag.String("cache-dir", "", "Media decryption and stream cache directory")
	flag.Parse()

	// Locate config dir
	dir := *configDir
	if dir == "" {
		dir = os.Getenv("OHG_CONFIG_DIR")
	}
	if dir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			base = os.TempDir()
		}
		dir = filepath.Join(base, "openhongguo")
	}
	_ = os.MkdirAll(dir, 0700)

	// Profile store and Client with SmartTransport
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
		fmt.Fprintf(os.Stderr, "Error initializing openhongguo client: %v\n", err)
		os.Exit(1)
	}

	histStore := history.NewStore(filepath.Join(dir, "history.json"))

	// Create Web Server
	srv, err := webserver.NewServer(webserver.Config{
		Client:       client,
		HistoryStore: histStore,
		CacheDir:     *cacheDir,
		StaticFS:     webserver.EmbeddedAssets(),
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error initializing web server: %v\n", err)
		os.Exit(1)
	}

	listenAddr := fmt.Sprintf("%s:%d", *addr, *port)
	listener, err := net.Listen("tcp", listenAddr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error listening on %s: %v\n", listenAddr, err)
		os.Exit(1)
	}

	url := fmt.Sprintf("http://127.0.0.1:%d", *port)
	if *addr != "127.0.0.1" && *addr != "localhost" && *addr != "0.0.0.0" {
		url = fmt.Sprintf("http://%s:%d", *addr, *port)
	}

	httpServer := &http.Server{
		Handler: srv.Handler(),
	}

	// Start HTTP server
	go func() {
		if err := httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		}
	}()

	fmt.Println("==================================================")
	fmt.Println("  红果短剧 OpenHongguo Web & Windows 桌面客户端")
	fmt.Println("==================================================")
	fmt.Printf(" 服务地址: %s\n", url)
	if *addr == "0.0.0.0" {
		fmt.Println(" 局域网访问: 手机/平板/TV 浏览器打开本机局域网 IP:5210 即可观看")
	}
	fmt.Println(" 按 Ctrl+C 退出服务")
	fmt.Println("--------------------------------------------------")

	// Open Browser or Desktop window
	if *desktop {
		go launchDesktopMode(url)
	} else if *open {
		go openBrowser(url)
	}

	// Graceful shutdown on Interrupt / SIGTERM
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\n正在关闭服务...")
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
	fmt.Println("服务已停止。")
}

func launchDesktopMode(url string) {
	edge, chrome := webserver.FindBrowser()
	var browserPath string
	if edge != "" {
		browserPath = edge
	} else if chrome != "" {
		browserPath = chrome
	}

	if browserPath != "" {
		// Launch browser in app mode (frameless dedicated desktop window)
		cmd := exec.Command(browserPath, fmt.Sprintf("--app=%s", url))
		if err := cmd.Start(); err == nil {
			return
		}
	}

	// Fallback to regular browser open
	openBrowser(url)
}

func openBrowser(url string) {
	// Wait a moment for server to be fully responsive
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
