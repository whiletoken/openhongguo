use super::ffplay::which;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

/// MPV open-source media player launcher and controller.
pub struct Mpv {
    path: PathBuf,
}

impl Mpv {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    /// Try to locate `mpv.exe` in PATH or common Windows installation paths.
    pub fn find() -> Option<PathBuf> {
        // 1. PATH lookup
        if let Ok(path) = which::which("mpv") {
            return Some(path);
        }

        // 2. Scoop shim or Chocolatey path
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let scoop_mpv = Path::new(&userprofile).join("scoop\\shims\\mpv.exe");
            if scoop_mpv.exists() {
                return Some(scoop_mpv);
            }
        }

        // 3. Program Files
        for prefix in &["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"] {
            if let Ok(dir) = std::env::var(prefix) {
                let cand = Path::new(&dir).join("mpv\\mpv.exe");
                if cand.exists() {
                    return Some(cand);
                }
            }
        }

        None
    }

    /// Launch MPV with specified stream URL, title, and start position.
    pub fn play(
        &self,
        stream_url: &str,
        title: &str,
        start_seconds: u32,
    ) -> std::io::Result<Child> {
        let mut cmd = Command::new(&self.path);

        let window_title = if title.is_empty() {
            "红果短剧 - MPV 播放器".to_string()
        } else {
            format!("红果短剧 - {}", title)
        };

        cmd.arg(format!("--title={}", window_title));
        cmd.arg("--force-window=yes");

        if start_seconds > 0 {
            cmd.arg(format!("--start={}", start_seconds));
        }

        cmd.arg(stream_url);

        cmd.stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());

        cmd.spawn()
    }
}
