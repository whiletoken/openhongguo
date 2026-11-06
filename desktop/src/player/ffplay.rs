use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

/// FFplay open-source media player launcher and controller.
pub struct FFplay {
    path: PathBuf,
}

impl FFplay {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    /// Try to locate `ffplay.exe` in PATH or common Windows installation paths.
    pub fn find() -> Option<PathBuf> {
        // 1. Check if `ffplay` or `ffplay.exe` is in PATH
        if let Ok(path) = which::which("ffplay") {
            return Some(path);
        }

        // 2. Check WinGet Gyan.FFmpeg packages directory in %LOCALAPPDATA%
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let winget_dir = Path::new(&local_app_data).join("Microsoft\\WinGet\\Packages");
            if winget_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&winget_dir) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.contains("FFmpeg") {
                            // Check subdirectories for bin/ffplay.exe
                            let p = entry.path();
                            if let Ok(sub_entries) = std::fs::read_dir(&p) {
                                for sub in sub_entries.flatten() {
                                    let cand = sub.path().join("bin\\ffplay.exe");
                                    if cand.exists() {
                                        return Some(cand);
                                    }
                                }
                            }
                            let direct_cand = p.join("bin\\ffplay.exe");
                            if direct_cand.exists() {
                                return Some(direct_cand);
                            }
                        }
                    }
                }
            }
        }

        // 3. Check Program Files
        for prefix in &["PROGRAMFILES", "PROGRAMFILES(X86)"] {
            if let Ok(dir) = std::env::var(prefix) {
                let cand = Path::new(&dir).join("ffmpeg\\bin\\ffplay.exe");
                if cand.exists() {
                    return Some(cand);
                }
            }
        }

        None
    }

    /// Launch FFplay with specified stream URL, title, and start position.
    pub fn play(
        &self,
        stream_url: &str,
        title: &str,
        start_seconds: u32,
    ) -> std::io::Result<Child> {
        let mut cmd = Command::new(&self.path);

        // Window Title
        let window_title = if title.is_empty() {
            "红果短剧 - FFplay 播放器".to_string()
        } else {
            format!("红果短剧 - {}", title)
        };

        cmd.arg("-window_title").arg(&window_title);

        // Auto-exit when the media finishes playing
        cmd.arg("-autoexit");

        // Sensible default window dimensions
        cmd.arg("-x").arg("1280").arg("-y").arg("720");

        // Seeking position if resuming mid-episode
        if start_seconds > 0 {
            cmd.arg("-ss").arg(start_seconds.to_string());
        }

        // Hide banner for cleaner output
        cmd.arg("-hide_banner");

        // Target stream URL
        cmd.arg(stream_url);

        // Detach stdin / stdout so it doesn't block the client
        cmd.stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());

        cmd.spawn()
    }
}

// Minimal inline `which` replacement for Windows without external dependencies
pub mod which {
    use std::path::PathBuf;

    pub fn which(binary_name: &str) -> Result<PathBuf, ()> {
        let path_var = std::env::var("PATH").map_err(|_| ())?;
        let exts = vec!["", ".exe", ".cmd", ".bat"];

        for dir in std::env::split_paths(&path_var) {
            for ext in &exts {
                let full_name = format!("{}{}", binary_name, ext);
                let full_path = dir.join(full_name);
                if full_path.is_file() {
                    return Ok(full_path);
                }
            }
        }
        Err(())
    }
}
