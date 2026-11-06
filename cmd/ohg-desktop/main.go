package main

import (
	"flag"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/beilunyang/openhongguo/internal/webserver"
	"github.com/beilunyang/openhongguo/web"
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	defaultServer := envOr("OHG_SERVER_URL", "http://127.0.0.1:5210")
	serverAddr := flag.String("server", defaultServer, "OpenHongguo 服务端 API 地址 (例如 http://127.0.0.1:5210 或 http://192.168.1.100:5210)")
	clientPort := flag.Int("port", 5211, "桌面客户端本地 UI 静态托管端口")
	clientAddr := flag.String("addr", "127.0.0.1", "桌面客户端本地 UI 绑定地址")
	configDir := flag.String("config-dir", "", "客户端数据与 PID 目录")
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

	// PID Management
	pidPath := filepath.Join(dir, "ohg-desktop.pid")
	pidMgr, err := webserver.AcquirePIDFile(pidPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "警告: 桌面客户端 PID 管理异常: %v\n", err)
	} else {
		defer pidMgr.Release()
	}

	// Clean server URL
	serverTarget := strings.TrimRight(*serverAddr, "/")
	if !strings.HasPrefix(serverTarget, "http://") && !strings.HasPrefix(serverTarget, "https://") {
		serverTarget = "http://" + serverTarget
	}

	// 1. Check if the configured server is responding
	serverOnline := checkServerStatus(serverTarget)

	// 2. Start lightweight local UI static asset server
	listener, actualPort, err := startClientStaticServer(*clientAddr, *clientPort, web.Assets())
	if err != nil {
		fmt.Fprintf(os.Stderr, "启动本地 UI 服务失败: %v\n", err)
		os.Exit(1)
	}

	clientURL := fmt.Sprintf("http://127.0.0.1:%d/?server=%s", actualPort, url.QueryEscape(serverTarget))

	fmt.Println("==================================================")
	fmt.Println("  红果短剧 OpenHongguo - 桌面客户端 (Client Mode)")
	fmt.Println("==================================================")
	fmt.Printf(" 服务端 API 地址: %s\n", serverTarget)
	if serverOnline {
		fmt.Println(" 服务端连接状态: [正常在线]")
	} else {
		fmt.Println(" 服务端连接状态: [未连接] (提示: 请确保 ohg-server 服务已启动)")
	}
	fmt.Printf(" 本地客户端界面: http://127.0.0.1:%d\n", actualPort)
	fmt.Println(" 正在启动无边框独立应用窗口...")
	fmt.Println(" 按 Ctrl+C 退出桌面客户端")
	fmt.Println("--------------------------------------------------")

	// Launch Edge or Chrome in desktop app mode
	go launchDesktopWindow(clientURL)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\n正在关闭桌面客户端...")
	if listener != nil {
		_ = listener.Close()
	}
	if pidMgr != nil {
		pidMgr.Release()
	}
	fmt.Println("桌面客户端已安全退出。")
}

func checkServerStatus(serverURL string) bool {
	client := &http.Client{Timeout: 800 * time.Millisecond}
	resp, err := client.Get(serverURL + "/api/system/status")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func startClientStaticServer(addr string, preferPort int, staticFS fs.FS) (net.Listener, int, error) {
	mux := http.NewServeMux()
	fileServer := http.FileServer(http.FS(staticFS))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".css") || strings.HasSuffix(r.URL.Path, ".js") {
			w.Header().Set("Cache-Control", "no-cache")
		}
		fileServer.ServeHTTP(w, r)
	})

	listenAddr := fmt.Sprintf("%s:%d", addr, preferPort)
	listener, err := net.Listen("tcp", listenAddr)
	if err != nil {
		// Fallback to automatic dynamic port if preferPort is occupied
		fallbackAddr := fmt.Sprintf("%s:0", addr)
		listener, err = net.Listen("tcp", fallbackAddr)
		if err != nil {
			return nil, 0, err
		}
	}

	actualPort := listener.Addr().(*net.TCPAddr).Port

	server := &http.Server{
		Handler: mux,
	}

	go func() {
		_ = server.Serve(listener)
	}()

	return listener, actualPort, nil
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

	// Fallback to default system browser
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
