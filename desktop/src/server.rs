use crate::assets::AssetManager;
use crate::player::{detect_players, launch_external_player};
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tiny_http::{Header, Method, Response, Server, StatusCode};

#[derive(Debug, Deserialize)]
pub struct PlayNativeRequest {
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub player: String,
    #[serde(default)]
    pub start_seconds: u32,
    #[serde(default)]
    pub episode_id: String,
    #[serde(default)]
    pub quality: String,
}

pub struct ClientServer {
    server: Arc<Server>,
    actual_port: u16,
    running: Arc<AtomicBool>,
}

impl ClientServer {
    pub fn start(
        addr: &str,
        prefer_port: u16,
        server_target: String,
    ) -> Result<Self, String> {
        // Try prefer_port first, fallback to 0 (dynamic port)
        let listen_addr = format!("{}:{}", addr, prefer_port);
        let server = match Server::http(&listen_addr) {
            Ok(s) => s,
            Err(_) => Server::http(format!("{}:0", addr)).map_err(|e| e.to_string())?,
        };

        let actual_port = server.server_addr().to_ip().map(|i| i.port()).unwrap_or(prefer_port);
        let server_arc = Arc::new(server);
        let running = Arc::new(AtomicBool::new(true));

        let server_clone = Arc::clone(&server_arc);
        let running_clone = Arc::clone(&running);
        let assets = AssetManager::new();

        std::thread::spawn(move || {
            for mut request in server_clone.incoming_requests() {
                if !running_clone.load(Ordering::Relaxed) {
                    break;
                }

                let url_path = request.url().split('?').next().unwrap_or("/").to_string();

                // 1. Client Status API
                if url_path == "/api/client/status" {
                    let players = detect_players();
                    let body = serde_json::json!({
                        "client": "OpenHongguo Rust Desktop Client",
                        "version": "0.2.0",
                        "server_target": server_target,
                        "players": players.iter().map(|p| serde_json::json!({
                            "id": p.id,
                            "name": p.name,
                            "available": p.available,
                            "kind": match p.kind {
                                crate::player::PlayerKind::Embedded => "embedded",
                                crate::player::PlayerKind::Native => "native",
                            },
                            "path": p.path.as_ref().map(|x| x.to_string_lossy().to_string()),
                            "description": p.description,
                        })).collect::<Vec<_>>()
                    });
                    let json_bytes = serde_json::to_vec(&body).unwrap_or_default();
                    let mut resp = Response::from_data(json_bytes);
                    resp.add_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap());
                    resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
                    let _ = request.respond(resp);
                    continue;
                }

                // 2. Client Players API
                if url_path == "/api/client/players" {
                    let players = detect_players();
                    let body = serde_json::to_vec(&players).unwrap_or_default();
                    let mut resp = Response::from_data(body);
                    resp.add_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap());
                    resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
                    let _ = request.respond(resp);
                    continue;
                }

                // 3. Play Native / External Player API (FFplay, MPV, VLC)
                if (url_path == "/api/client/play_native" || url_path == "/api/play_external")
                    && (request.method() == &Method::Post || request.method() == &Method::Options)
                {
                    // Handle CORS Preflight
                    if request.method() == &Method::Options {
                        let mut resp = Response::empty(StatusCode(200));
                        resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
                        resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"POST, OPTIONS"[..]).unwrap());
                        resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..]).unwrap());
                        let _ = request.respond(resp);
                        continue;
                    }

                    let mut body_str = String::new();
                    let _ = request.as_reader().read_to_string(&mut body_str);

                    let req_data: Result<PlayNativeRequest, _> = serde_json::from_str(&body_str);
                    match req_data {
                        Ok(p) => {
                            let stream_url = if !p.url.is_empty() {
                                p.url
                            } else if !p.episode_id.is_empty() {
                                crate::client::build_stream_url(
                                    &server_target,
                                    &p.episode_id,
                                    "",
                                    if p.quality.is_empty() { "1080p" } else { &p.quality },
                                )
                            } else {
                                "".to_string()
                            };

                            if stream_url.is_empty() {
                                let err_json = serde_json::to_vec(&serde_json::json!({
                                    "ok": false,
                                    "error": "缺少有效流媒体播放地址或 episode_id"
                                })).unwrap_or_default();
                                let mut resp = Response::from_data(err_json);
                                resp.add_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap());
                                resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
                                let _ = request.respond(resp);
                                continue;
                            }

                            match launch_external_player(&p.player, &stream_url, &p.title, p.start_seconds) {
                                Ok(used_player) => {
                                    let success_json = serde_json::to_vec(&serde_json::json!({
                                        "ok": true,
                                        "player": used_player,
                                        "message": format!("已调用开源播放器 {} 播放", used_player)
                                    })).unwrap_or_default();
                                    let mut resp = Response::from_data(success_json);
                                    resp.add_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap());
                                    resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
                                    let _ = request.respond(resp);
                                }
                                Err(err_msg) => {
                                    let err_json = serde_json::to_vec(&serde_json::json!({
                                        "ok": false,
                                        "error": err_msg
                                    })).unwrap_or_default();
                                    let mut resp = Response::from_data(err_json);
                                    resp.add_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap());
                                    resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
                                    let _ = request.respond(resp);
                                }
                            }
                        }
                        Err(e) => {
                            let err_json = serde_json::to_vec(&serde_json::json!({
                                "ok": false,
                                "error": format!("解析请求体失败: {}", e)
                            })).unwrap_or_default();
                            let mut resp = Response::from_data(err_json);
                            resp.add_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap());
                            resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
                            let _ = request.respond(resp);
                        }
                    }
                    continue;
                }

                // 4. Static Assets Server
                let req_path = if url_path == "/" || url_path.is_empty() {
                    "index.html"
                } else {
                    url_path.trim_start_matches('/')
                };

                if let Some(bytes) = assets.get(req_path) {
                    let mime = AssetManager::mime_type(req_path);
                    let mut resp = Response::from_data(bytes);

                    if let Ok(hdr) = Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()) {
                        resp.add_header(hdr);
                    }
                    resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());

                    // Disable cache for script / style updates in development
                    if req_path.ends_with(".js") || req_path.ends_with(".css") {
                        resp.add_header(Header::from_bytes(&b"Cache-Control"[..], &b"no-cache"[..]).unwrap());
                    }

                    let _ = request.respond(resp);
                } else {
                    let resp = Response::from_string("404 Not Found").with_status_code(404);
                    let _ = request.respond(resp);
                }
            }
        });

        Ok(Self {
            server: server_arc,
            actual_port,
            running,
        })
    }

    pub fn port(&self) -> u16 {
        self.actual_port
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
        self.server.unblock();
    }
}
