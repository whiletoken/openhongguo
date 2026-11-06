use super::ffplay::which;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

/// VLC open-source media player launcher and controller.
pub struct Vlc {
    path: PathBuf,
}

impl Vlc {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    /// Try to locate `vlc.exe` in PATH or common Windows installation paths.
    pub fn find() -> Option<PathBuf> {
        // 1. PATH lookup
        if let Ok(path) = which::which("vlc") {
            return Some(path);
        }

        // 2. Program Files
        for prefix in &["PROGRAMFILES", "PROGRAMFILES(X86)"] {
            if let Ok(dir) = std::env::var(prefix) {
                let cand = Path::new(&dir).join("VideoLAN\\VLC\\vlc.exe");
                if cand.exists() {
                    return Some(cand);
                }
            }
        }

        None
    }

    /// Launch VLC with specified stream URL, title, and start position.
    pub fn play(
        &self,
        stream_url: &str,
        title: &str,
        start_seconds: u32,
    ) -> std::io::Result<Child> {
        let mut cmd = Command::new(&self.path);

        let window_title = if title.is_empty() {
            "红果短剧 - VLC 播放器".to_string()
        } else {
            format!("红果短剧 - {}", title)
        };

        cmd.arg(format!("--meta-title={}", window_title));

        if start_seconds > 0 {
            cmd.arg(format!("--start-time={}", start_seconds));
        }

        cmd.arg(stream_url);

        cmd.stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());

        cmd.spawn()
    }
}
