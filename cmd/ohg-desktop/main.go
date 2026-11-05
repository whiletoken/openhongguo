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
	"github.com/beilunyang/openhongguo/web"
)

func main() {
	port := flag.Int("port", 5210, "本地服务端口")
	addr := flag.String("addr", "127.0.0.1", "本地服务绑定地址")
	configDir := flag.String("config-dir", "", "配置文件与匿名设备信息目录")
	cacheDir := flag.String("cache-dir", "", "媒体流解密与缓存目录")
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

	// Windows Client PID management: stale PID cleanup, single instance takeover
	pidPath := filepath.Join(dir, "ohg-desktop.pid")
	pidMgr, err := webserver.AcquirePIDFile(pidPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "警告: 桌面客户端 PID 管理异常: %v\n", err)
	} else {
		defer pidMgr.Release()
	}

	url := fmt.Sprintf("http://127.0.0.1:%d", *port)

	// Check if local server is already running on the port
	isServerRunning := func() bool {
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", *port), 200*time.Millisecond)
		if err == nil {
			conn.Close()
			return true
		}
		return false
	}

	var httpServer *http.Server

	if !isServerRunning() {
		// Start background embedded server engine
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
			fmt.Fprintf(os.Stderr, "初始化 SDK 客户端失败: %v\n", err)
			os.Exit(1)
		}

		histStore := history.NewStore(filepath.Join(dir, "history.json"))

		srv, err := webserver.NewServer(webserver.Config{
			Client:       client,
			HistoryStore: histStore,
			CacheDir:     *cacheDir,
			StaticFS:     web.Assets(),
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "初始化本地服务引擎失败: %v\n", err)
			os.Exit(1)
		}

		listenAddr := fmt.Sprintf("%s:%d", *addr, *port)
		listener, err := net.Listen("tcp", listenAddr)
		if err != nil {
			fmt.Fprintf(os.Stderr, "监听失败 (%s): %v\n", listenAddr, err)
			os.Exit(1)
		}

		httpServer = &http.Server{
			Handler: srv.Handler(),
		}

		go func() {
			if err := httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
				fmt.Fprintf(os.Stderr, "服务异常: %v\n", err)
			}
		}()
	}

	fmt.Println("==================================================")
	fmt.Println("  红果短剧 OpenHongguo - Windows 桌面客户端")
	fmt.Println("==================================================")
	fmt.Printf(" 应用地址: %s\n", url)
	fmt.Println(" 正在启动无边框独立窗口应用模式...")
	fmt.Println("--------------------------------------------------")

	// Launch Edge or Chrome in desktop --app mode
	go launchDesktopWindow(url)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\n正在关闭桌面客户端...")
	if httpServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(ctx)
	}
	if pidMgr != nil {
		pidMgr.Release()
	}
	fmt.Println("桌面客户端已安全退出。")
}

func launchDesktopWindow(url string) {
	edge, chrome := webserver.FindBrowser()
	var browserPath string
	if edge != "" {
		browserPath = edge
	} else if chrome != "" {
		browserPath = chrome
	}

	if browserPath != "" {
		cmd := exec.Command(browserPath, fmt.Sprintf("--app=%s", url))
		if err := cmd.Start(); err == nil {
			return
		}
	}

	// Fallback to default browser
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
