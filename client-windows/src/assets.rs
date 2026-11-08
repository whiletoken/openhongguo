use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub struct AssetManager {
    web_dir: Option<PathBuf>,
    embedded: HashMap<&'static str, &'static [u8]>,
}

impl AssetManager {
    pub fn new() -> Self {
        let mut embedded = HashMap::new();

        // Embed static assets into binary for standalone portability
        embedded.insert("index.html", include_bytes!("../../web/index.html").as_slice());
        embedded.insert("css/app.css", include_bytes!("../../web/css/app.css").as_slice());
        embedded.insert("css/base.css", include_bytes!("../../web/css/base.css").as_slice());
        embedded.insert("css/catalog.css", include_bytes!("../../web/css/catalog.css").as_slice());
        embedded.insert("css/components.css", include_bytes!("../../web/css/components.css").as_slice());
        embedded.insert("css/layout.css", include_bytes!("../../web/css/layout.css").as_slice());
        embedded.insert("css/responsive.css", include_bytes!("../../web/css/responsive.css").as_slice());
        embedded.insert("css/theater.css", include_bytes!("../../web/css/theater.css").as_slice());
        embedded.insert("js/api.js", include_bytes!("../../web/js/api.js").as_slice());
        embedded.insert("js/app.js", include_bytes!("../../web/js/app.js").as_slice());
        embedded.insert("js/artplayer.js", include_bytes!("../../web/js/artplayer.js").as_slice());
        embedded.insert("js/cache_sync.js", include_bytes!("../../web/js/cache_sync.js").as_slice());
        embedded.insert("js/catalog.js", include_bytes!("../../web/js/catalog.js").as_slice());
        embedded.insert("js/episodes.js", include_bytes!("../../web/js/episodes.js").as_slice());
        embedded.insert("js/favorites.js", include_bytes!("../../web/js/favorites.js").as_slice());
        embedded.insert("js/history.js", include_bytes!("../../web/js/history.js").as_slice());
        embedded.insert("js/logger.js", include_bytes!("../../web/js/logger.js").as_slice());
        embedded.insert("js/navigation.js", include_bytes!("../../web/js/navigation.js").as_slice());
        embedded.insert("js/player.js", include_bytes!("../../web/js/player.js").as_slice());
        embedded.insert("js/search_history.js", include_bytes!("../../web/js/search_history.js").as_slice());
        embedded.insert("js/settings.js", include_bytes!("../../web/js/settings.js").as_slice());
        embedded.insert("js/shortcuts.js", include_bytes!("../../web/js/shortcuts.js").as_slice());
        embedded.insert("js/state.js", include_bytes!("../../web/js/state.js").as_slice());
        embedded.insert("js/theater_layout.js", include_bytes!("../../web/js/theater_layout.js").as_slice());
        embedded.insert("js/utils.js", include_bytes!("../../web/js/utils.js").as_slice());

        // Probe disk for live web/ directory (for development overrides)
        let mut web_dir = None;

        if let Ok(cwd) = std::env::current_dir() {
            let cand1 = cwd.join("web");
            let cand2 = cwd.join("..\\web");
            if cand1.is_dir() && cand1.join("index.html").exists() {
                web_dir = Some(cand1);
            } else if cand2.is_dir() && cand2.join("index.html").exists() {
                web_dir = Some(cand2);
            }
        }

        if web_dir.is_none() {
            if let Ok(exe) = std::env::current_exe() {
                if let Some(exe_dir) = exe.parent() {
                    let cand1 = exe_dir.join("web");
                    let cand2 = exe_dir.join("..\\web");
                    if cand1.is_dir() && cand1.join("index.html").exists() {
                        web_dir = Some(cand1);
                    } else if cand2.is_dir() && cand2.join("index.html").exists() {
                        web_dir = Some(cand2);
                    }
                }
            }
        }

        Self { web_dir, embedded }
    }

    /// Load asset contents by relative path (e.g. "index.html", "css/app.css")
    pub fn get(&self, raw_path: &str) -> Option<Vec<u8>> {
        let clean = raw_path.trim_start_matches('/').trim_start_matches('\\');
        let key = if clean.is_empty() { "index.html" } else { clean };

        // 1. Try disk file first if web_dir exists
        if let Some(dir) = &self.web_dir {
            let disk_path = dir.join(key);
            if disk_path.is_file() {
                if let Ok(bytes) = std::fs::read(&disk_path) {
                    return Some(bytes);
                }
            }
        }

        // 2. Fallback to embedded slice
        self.embedded.get(key).map(|s| s.to_vec())
    }

    /// Guess MIME content-type header for response
    pub fn mime_type(path: &str) -> &'static str {
        let clean = path.trim_start_matches('/').trim_start_matches('\\');
        let p = Path::new(clean);
        match p.extension().and_then(|e| e.to_str()).unwrap_or("") {
            "html" | "htm" => "text/html; charset=utf-8",
            "css" => "text/css; charset=utf-8",
            "js" | "mjs" => "application/javascript; charset=utf-8",
            "json" => "application/json; charset=utf-8",
            "svg" => "image/svg+xml",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "ico" => "image/x-icon",
            "woff" => "font/woff",
            "woff2" => "font/woff2",
            "ttf" => "font/ttf",
            _ => "application/octet-stream",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_asset_manager_embedded() {
        let mgr = AssetManager::new();
        let index = mgr.get("index.html");
        assert!(index.is_some());
        let content = String::from_utf8_lossy(&index.unwrap()).to_string();
        assert!(content.contains("<!DOCTYPE html>"));
    }

    #[test]
    fn test_mime_types() {
        assert_eq!(AssetManager::mime_type("index.html"), "text/html; charset=utf-8");
        assert_eq!(AssetManager::mime_type("css/app.css"), "text/css; charset=utf-8");
        assert_eq!(AssetManager::mime_type("js/app.js"), "application/javascript; charset=utf-8");
        assert_eq!(AssetManager::mime_type("logo.svg"), "image/svg+xml");
    }
}
