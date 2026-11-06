use std::path::{Path, PathBuf};
use std::process::Command;

/// Finds Microsoft Edge or Google Chrome to launch in desktop application mode.
pub fn find_desktop_browser() -> Option<PathBuf> {
    // 1. Try Microsoft Edge (Standard on modern Windows 10/11)
    for prefix in &["PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"] {
        if let Ok(dir) = std::env::var(prefix) {
            let cand = Path::new(&dir).join("Microsoft\\Edge\\Application\\msedge.exe");
            if cand.is_file() {
                return Some(cand);
            }
        }
    }

    // 2. Try Google Chrome
    for prefix in &["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"] {
        if let Ok(dir) = std::env::var(prefix) {
            let cand = Path::new(&dir).join("Google\\Chrome\\Application\\chrome.exe");
            if cand.is_file() {
                return Some(cand);
            }
        }
    }

    None
}

/// Launches the client URL in an independent, distraction-free desktop app window.
pub fn launch_desktop_window(client_url: &str) {
    if let Some(browser_exe) = find_desktop_browser() {
        let mut cmd = Command::new(&browser_exe);
        cmd.arg(format!("--app={}", client_url));
        if let Ok(child) = cmd.spawn() {
            // Started in standalone app window mode
            let _ = child;
            return;
        }
    }

    // Fallback: Open in default system browser
    let _ = Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", client_url])
        .spawn();
}
