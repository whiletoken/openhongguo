use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SeriesItem {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub cover_url: String,
    #[serde(default)]
    pub episode_count: u32,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EpisodeItem {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub number: u32,
    #[serde(default)]
    pub title: String,
}

#[derive(Debug, Deserialize)]
struct Page<T> {
    #[serde(default)]
    pub items: Vec<T>,
}

/// Check if OpenHongguo backend server is reachable.
pub fn check_server_status(server_url: &str) -> bool {
    let target = format!("{}/api/system/status", server_url.trim_end_matches('/'));
    match ureq::get(&target)
        .timeout(Duration::from_millis(1200))
        .call()
    {
        Ok(resp) => resp.status() == 200,
        Err(_) => false,
    }
}

/// Search short dramas on the backend server.
pub fn search_series(server_url: &str, keyword: &str) -> Result<Vec<SeriesItem>, String> {
    let encoded: String = form_urlencoded::byte_serialize(keyword.as_bytes()).collect();
    let target = format!("{}/api/search?q={}", server_url.trim_end_matches('/'), encoded);

    let resp = ureq::get(&target)
        .timeout(Duration::from_secs(10))
        .call()
        .map_err(|e| format!("请求服务端失败: {}", e))?;

    let text = resp
        .into_string()
        .map_err(|e| format!("读取服务端响应失败: {}", e))?;

    let page: Page<SeriesItem> = serde_json::from_str(&text)
        .map_err(|e| format!("解析服务端响应失败: {}", e))?;

    Ok(page.items)
}

/// Fetch episode list for a series.
pub fn get_episodes(server_url: &str, series_id: &str) -> Result<Vec<EpisodeItem>, String> {
    let encoded: String = form_urlencoded::byte_serialize(series_id.as_bytes()).collect();
    let target = format!("{}/api/episodes?id={}", server_url.trim_end_matches('/'), encoded);

    let resp = ureq::get(&target)
        .timeout(Duration::from_secs(10))
        .call()
        .map_err(|e| format!("请求剧集列表失败: {}", e))?;

    let text = resp
        .into_string()
        .map_err(|e| format!("读取剧集列表响应失败: {}", e))?;

    let page: Page<EpisodeItem> = serde_json::from_str(&text)
        .map_err(|e| format!("解析剧集列表响应失败: {}", e))?;

    Ok(page.items)
}

/// Build stream URL for direct player consumption.
pub fn build_stream_url(
    server_url: &str,
    episode_id: &str,
    series_id: &str,
    quality: &str,
) -> String {
    let ep_enc: String = form_urlencoded::byte_serialize(episode_id.as_bytes()).collect();
    let ser_enc: String = form_urlencoded::byte_serialize(series_id.as_bytes()).collect();
    let q_enc: String = form_urlencoded::byte_serialize(quality.as_bytes()).collect();

    format!(
        "{}/api/stream?episode_id={}&series_id={}&quality={}",
        server_url.trim_end_matches('/'),
        ep_enc,
        ser_enc,
        q_enc
    )
}

mod form_urlencoded {
    pub fn byte_serialize(input: &[u8]) -> impl Iterator<Item = String> + '_ {
        input.iter().map(|&b| {
            if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
                (b as char).to_string()
            } else {
                format!("%{:02X}", b)
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_stream_url() {
        let url = build_stream_url("http://127.0.0.1:5210/", "ep 101", "ser 202", "1080p");
        assert_eq!(
            url,
            "http://127.0.0.1:5210/api/stream?episode_id=ep%20101&series_id=ser%20202&quality=1080p"
        );
    }
}
