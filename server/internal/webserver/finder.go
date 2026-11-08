package webserver

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// ToolsInfo reports the availability of external binaries.
type ToolsInfo struct {
	FFmpegPath  string `json:"ffmpeg_path"`
	FFmpegReady bool   `json:"ffmpeg_ready"`
	FFplayPath  string `json:"ffplay_path"`
	FFplayReady bool   `json:"ffplay_ready"`
	MpvPath     string `json:"mpv_path"`
	MpvReady    bool   `json:"mpv_ready"`
	VlcPath     string `json:"vlc_path"`
	VlcReady    bool   `json:"vlc_ready"`
	EdgePath    string `json:"edge_path"`
	ChromePath  string `json:"chrome_path"`
	DesktopMode bool   `json:"desktop_mode"`
}

// FindTool searches for an executable in PATH and common installation paths.
func FindTool(name string) string {
	// 1. Try standard exec.LookPath
	if p, err := exec.LookPath(name); err == nil {
		return p
	}

	if runtime.GOOS != "windows" {
		// Common unix paths
		for _, dir := range []string{"/usr/local/bin", "/usr/bin", "/opt/homebrew/bin"} {
			candidate := filepath.Join(dir, name)
			if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
				return candidate
			}
		}
		return ""
	}

	exeName := name
	if !strings.HasSuffix(strings.ToLower(exeName), ".exe") {
		exeName += ".exe"
	}

	// 2. Windows specific candidate directories
	localAppData := os.Getenv("LOCALAPPDATA")
	userProfile := os.Getenv("USERPROFILE")
	programFiles := os.Getenv("ProgramFiles")
	programFilesX86 := os.Getenv("ProgramFiles(x86)")

	candidates := []string{
		// WinGet Links
		filepath.Join(localAppData, "Microsoft", "WinGet", "Links", exeName),
		// Scoop
		filepath.Join(userProfile, "scoop", "shims", exeName),
		// Chocolatey
		filepath.Join(os.Getenv("ChocolateyInstall"), "bin", exeName),
		// Program Files
		filepath.Join(programFiles, name, "bin", exeName),
		filepath.Join(programFiles, name, exeName),
		filepath.Join(programFilesX86, name, "bin", exeName),
		filepath.Join(programFilesX86, name, exeName),
	}

	for _, cand := range candidates {
		if cand != "" {
			if fi, err := os.Stat(cand); err == nil && !fi.IsDir() {
				return cand
			}
		}
	}

	// 3. Search in WinGet packages directory for Gyan.FFmpeg or similar
	wingetPackages := filepath.Join(localAppData, "Microsoft", "WinGet", "Packages")
	if entries, err := os.ReadDir(wingetPackages); err == nil {
		for _, entry := range entries {
			if entry.IsDir() && strings.Contains(strings.ToLower(entry.Name()), "ffmpeg") {
				// search nested bin
				matches, _ := filepath.Glob(filepath.Join(wingetPackages, entry.Name(), "*", "bin", exeName))
				if len(matches) > 0 {
					return matches[0]
				}
				matches2, _ := filepath.Glob(filepath.Join(wingetPackages, entry.Name(), "bin", exeName))
				if len(matches2) > 0 {
					return matches2[0]
				}
			}
		}
	}

	return ""
}

// FindBrowser locates Edge or Chrome for --app desktop mode.
func FindBrowser() (string, string) {
	if runtime.GOOS != "windows" {
		if p, err := exec.LookPath("google-chrome"); err == nil {
			return p, "chrome"
		}
		if p, err := exec.LookPath("chromium"); err == nil {
			return p, "chromium"
		}
		return "", ""
	}

	programFiles := os.Getenv("ProgramFiles")
	programFilesX86 := os.Getenv("ProgramFiles(x86)")
	localAppData := os.Getenv("LOCALAPPDATA")

	// Microsoft Edge
	edgeCandidates := []string{
		filepath.Join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
	}
	var edgePath string
	for _, cand := range edgeCandidates {
		if fi, err := os.Stat(cand); err == nil && !fi.IsDir() {
			edgePath = cand
			break
		}
	}

	// Google Chrome
	chromeCandidates := []string{
		filepath.Join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
		filepath.Join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
		filepath.Join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
	}
	var chromePath string
	for _, cand := range chromeCandidates {
		if fi, err := os.Stat(cand); err == nil && !fi.IsDir() {
			chromePath = cand
			break
		}
	}

	return edgePath, chromePath
}

// DetectTools gathers system tools status.
func DetectTools() ToolsInfo {
	ffmpeg := FindTool("ffmpeg")
	ffplay := FindTool("ffplay")
	mpv := FindTool("mpv")
	vlc := FindTool("vlc")
	edge, chrome := FindBrowser()

	return ToolsInfo{
		FFmpegPath:  ffmpeg,
		FFmpegReady: ffmpeg != "",
		FFplayPath:  ffplay,
		FFplayReady: ffplay != "",
		MpvPath:     mpv,
		MpvReady:    mpv != "",
		VlcPath:     vlc,
		VlcReady:    vlc != "",
		EdgePath:    edge,
		ChromePath:  chrome,
		DesktopMode: edge != "" || chrome != "",
	}
}
