pub mod ffplay;
pub mod mpv;
pub mod vlc;

pub use ffplay::FFplay;
pub use mpv::Mpv;
pub use vlc::Vlc;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlayerKind {
    /// Open-source embedded web player (Artplayer, HTML5)
    #[serde(rename = "embedded")]
    Embedded,
    /// Open-source native desktop player (FFplay, MPV, VLC)
    #[serde(rename = "native")]
    Native,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerInfo {
    pub id: String,
    pub name: String,
    pub kind: PlayerKind,
    pub available: bool,
    pub path: Option<PathBuf>,
    pub description: String,
}

/// Detects all open-source players supported by the client.
pub fn detect_players() -> Vec<PlayerInfo> {
    let mut list = Vec::new();

    // 1. Embedded open-source player: Artplayer
    list.push(PlayerInfo {
        id: "artplayer".to_string(),
        name: "Artplayer (内置开源网页播放器)".to_string(),
        kind: PlayerKind::Embedded,
        available: true,
        path: None,
        description: "轻量现代 HTML5 开源播放器，支持 1080P/720P 画质切换、历史记忆与连播".to_string(),
    });

    // 2. FFplay (FFmpeg project)
    let ffplay_path = FFplay::find();
    list.push(PlayerInfo {
        id: "ffplay".to_string(),
        name: "FFplay (FFmpeg 官方播放器)".to_string(),
        kind: PlayerKind::Native,
        available: ffplay_path.is_some(),
        path: ffplay_path,
        description: "基于 FFmpeg 的轻量开源多媒体播放器，支持硬件加速与直接流解密播放".to_string(),
    });

    // 3. MPV
    let mpv_path = Mpv::find();
    list.push(PlayerInfo {
        id: "mpv".to_string(),
        name: "MPV (开源影音播放器)".to_string(),
        kind: PlayerKind::Native,
        available: mpv_path.is_some(),
        path: mpv_path,
        description: "极简高性能跨平台开源媒体播放器，拥有强大的解码能力".to_string(),
    });

    // 4. VLC
    let vlc_path = Vlc::find();
    list.push(PlayerInfo {
        id: "vlc".to_string(),
        name: "VLC (VideoLAN 媒体播放器)".to_string(),
        kind: PlayerKind::Native,
        available: vlc_path.is_some(),
        path: vlc_path,
        description: "知名开源全能多媒体播放器，广泛兼容各种编码格式".to_string(),
    });

    list
}

/// Launch a media stream in an open-source external player.
pub fn launch_external_player(
    preferred: &str,
    stream_url: &str,
    title: &str,
    start_seconds: u32,
) -> Result<String, String> {
    let players = detect_players();

    let target = preferred.to_lowercase();
    let player_id = if target == "auto" || target.is_empty() {
        // Priority for external play: FFplay -> MPV -> VLC
        if let Some(ff) = players.iter().find(|p| p.id == "ffplay" && p.available) {
            &ff.id
        } else if let Some(mpv) = players.iter().find(|p| p.id == "mpv" && p.available) {
            &mpv.id
        } else if let Some(vlc) = players.iter().find(|p| p.id == "vlc" && p.available) {
            &vlc.id
        } else {
            return Err("未在系统中检测到支持的开源播放器 (FFplay / MPV / VLC)。建议安装 FFmpeg 或使用客户端内置 Artplayer 播放。".to_string());
        }
    } else {
        &target
    };

    match player_id.as_str() {
        "ffplay" => {
            if let Some(path) = FFplay::find() {
                let p = FFplay::new(path);
                p.play(stream_url, title, start_seconds)
                    .map_err(|e| format!("启动 FFplay 失败: {}", e))?;
                Ok("ffplay".to_string())
            } else {
                Err("系统中未找到 ffplay.exe，请确保 FFmpeg 已加入系统 PATH".to_string())
            }
        }
        "mpv" => {
            if let Some(path) = Mpv::find() {
                let p = Mpv::new(path);
                p.play(stream_url, title, start_seconds)
                    .map_err(|e| format!("启动 MPV 失败: {}", e))?;
                Ok("mpv".to_string())
            } else {
                Err("系统中未找到 mpv.exe".to_string())
            }
        }
        "vlc" => {
            if let Some(path) = Vlc::find() {
                let p = Vlc::new(path);
                p.play(stream_url, title, start_seconds)
                    .map_err(|e| format!("启动 VLC 失败: {}", e))?;
                Ok("vlc".to_string())
            } else {
                Err("系统中未找到 vlc.exe".to_string())
            }
        }
        other => Err(format!("不支持的播放器类型: {}", other)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_players_includes_artplayer() {
        let players = detect_players();
        let art = players.iter().find(|p| p.id == "artplayer");
        assert!(art.is_some());
        assert!(art.unwrap().available);
    }

    #[test]
    fn test_unsupported_player() {
        let res = launch_external_player("unknown_player_xyz", "http://example.com/test.mp4", "Test", 0);
        assert!(res.is_err());
    }
}
