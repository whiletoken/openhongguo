mod assets;
mod client;
mod config;
mod logger;
mod panic;
mod player;
mod server;
mod window;

use config::{AppConfig, PidManager, SubCommand};
use player::detect_players;
use server::ClientServer;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

fn main() {
    let cfg = AppConfig::parse();

    // 1. 初始化日志输出与全局异常捕获体系
    logger::init(&cfg.config_dir);
    panic::setup_panic_hook(&cfg.config_dir);

    match cfg.command {
        SubCommand::Help => {
            print_help();
        }
        SubCommand::Players => {
            print_players();
        }
        SubCommand::Status => {
            print_status(&cfg.server_url);
        }
        SubCommand::Search { query } => {
            run_search(&cfg.server_url, &query);
        }
        SubCommand::Play {
            series_id,
            episode,
            player,
        } => {
            run_play(&cfg.server_url, &series_id, episode, &player);
        }
        SubCommand::Gui => {
            run_gui(cfg);
        }
    }
}

fn print_help() {
    println!("红果短剧 (OpenHongguo) - Windows 桌面客户端 (Rust 版)");
    println!();
    println!("用法:");
    println!("  ohg-desktop.exe [选项]");
    println!("  ohg-desktop.exe search <剧名关键词>");
    println!("  ohg-desktop.exe play <剧集ID> [--ep <集数>] [--player <ffplay|mpv|vlc>]");
    println!("  ohg-desktop.exe players");
    println!("  ohg-desktop.exe status");
    println!();
    println!("选项:");
    println!("  -server, --server <URL>    指定 OpenHongguo 后台 API 地址 (默认: http://127.0.0.1:5210)");
    println!("  -port, --port <端口>       指定桌面端本地 UI 托管端口 (默认: 5211)");
    println!("  -addr, --addr <地址>       指定桌面端本地 UI 绑定地址 (默认: 127.0.0.1)");
    println!("  -player, --player <名称>   首选开源播放器 (auto | ffplay | mpv | vlc | artplayer)");
    println!("  -ep, --ep <集数>           指定播放集数 (用于命令行播放，默认: 1)");
    println!("  -config-dir <目录>         自定义客户端配置与 PID 目录");
    println!("  -h, --help                 显示本帮助信息");
}

fn print_players() {
    println!("==================================================");
    println!("  已检测到的开源播放器支持情况");
    println!("==================================================");
    let players = detect_players();
    for p in players {
        let status = if p.available {
            "[已就绪]"
        } else {
            "[未安装/未找到]"
        };
        println!("{} {} ({})", status, p.name, p.id);
        println!("   说明: {}", p.description);
        if let Some(path) = p.path {
            println!("   路径: {}", path.display());
        }
        println!();
    }
}

fn print_status(server_url: &str) {
    println!("==================================================");
    println!("  OpenHongguo 客户端连通性状态");
    println!("==================================================");
    println!("服务端目标地址: {}", server_url);
    let online = client::check_server_status(server_url);
    if online {
        println!("服务端状态: [正常在线]");
    } else {
        println!("服务端状态: [未连接] (请确认 ohg-server 服务已在后台启动)");
    }
}

fn run_search(server_url: &str, query: &str) {
    if query.trim().is_empty() {
        eprintln!("错误: 请提供搜索关键词。例如: ohg-desktop.exe search 赘婿");
        std::process::exit(1);
    }
    println!("正在通过服务端 [{}] 搜索: \"{}\"...", server_url, query);
    match client::search_series(server_url, query) {
        Ok(items) => {
            if items.is_empty() {
                println!("未检索到相关短剧内容。");
                return;
            }
            println!("找到 {} 部短剧:\n", items.len());
            for (idx, item) in items.iter().enumerate() {
                println!(
                    "[{}] {} (全{}集)",
                    idx + 1,
                    item.title,
                    if item.episode_count > 0 {
                        item.episode_count.to_string()
                    } else {
                        "?".to_string()
                    }
                );
                println!("     剧集ID: {}", item.id);
                if !item.summary.is_empty() {
                    let summary_preview = if item.summary.chars().count() > 60 {
                        format!("{}...", item.summary.chars().take(60).collect::<String>())
                    } else {
                        item.summary.clone()
                    };
                    println!("     简介: {}", summary_preview);
                }
                println!();
            }
        }
        Err(e) => {
            eprintln!("搜索失败: {}", e);
            std::process::exit(1);
        }
    }
}

fn run_play(server_url: &str, series_id: &str, ep_num: u32, player_name: &str) {
    if series_id.trim().is_empty() {
        eprintln!("错误: 请提供剧集 ID。例如: ohg-desktop.exe play 7389148567117188159 --ep 1");
        std::process::exit(1);
    }

    println!("正在获取剧集选集信息: ID = {}...", series_id);
    let episodes = match client::get_episodes(server_url, series_id) {
        Ok(eps) => eps,
        Err(e) => {
            eprintln!("获取剧集失败: {}", e);
            std::process::exit(1);
        }
    };

    if episodes.is_empty() {
        eprintln!("错误: 该短剧无可选剧集。");
        std::process::exit(1);
    }

    let target_ep = episodes
        .iter()
        .find(|e| e.number == ep_num)
        .unwrap_or(&episodes[0]);

    let stream_url = client::build_stream_url(server_url, &target_ep.id, series_id, "1080p");
    let title = format!("第 {} 集", target_ep.number);

    println!(
        "正在使用开源播放器 [{}] 播放第 {} 集...",
        player_name, target_ep.number
    );

    match player::launch_external_player(player_name, &stream_url, &title, 0) {
        Ok(actual_player) => {
            println!("已成功启动开源播放器: {}", actual_player);
        }
        Err(e) => {
            eprintln!("播放器启动失败: {}", e);
            std::process::exit(1);
        }
    }
}

fn run_gui(cfg: AppConfig) {
    // 1. PID Management
    let _pid = PidManager::acquire(&cfg.config_dir);

    // 2. Check if the configured server is responding
    let server_online = client::check_server_status(&cfg.server_url);

    // 3. Start embedded UI server
    let server = match ClientServer::start(&cfg.client_addr, cfg.client_port, cfg.server_url.clone()) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("启动本地客户端 UI 服务失败: {}", e);
            std::process::exit(1);
        }
    };

    let actual_port = server.port();
    let client_url = format!(
        "http://127.0.0.1:{}/?server={}",
        actual_port,
        urlencoding(&cfg.server_url)
    );

    println!("==================================================");
    println!("  红果短剧 OpenHongguo - Windows 桌面客户端 (Rust 版)");
    println!("==================================================");
    println!(" 服务端 API 地址: {}", cfg.server_url);
    if server_online {
        println!(" 服务端连接状态: [正常在线]");
    } else {
        println!(" 服务端连接状态: [未连接] (提示: 请确保 ohg-server 服务已启动)");
    }
    println!(" 本地客户端界面: http://127.0.0.1:{}", actual_port);

    // List open-source players
    let players = detect_players();
    let ready_players: Vec<String> = players
        .iter()
        .filter(|p| p.available)
        .map(|p| p.id.clone())
        .collect();
    println!(" 首选播放器模式: {}", cfg.preferred_player);
    println!(" 可用开源播放器: {}", ready_players.join(" / "));

    println!(" 正在启动无边框独立桌面应用窗口...");
    println!(" 按 Ctrl+C 退出桌面客户端");
    println!("--------------------------------------------------");

    // 4. Launch desktop window
    window::launch_desktop_window(&client_url);

    // 5. Wait for Ctrl+C
    let term = Arc::new(AtomicBool::new(false));
    let term_clone = Arc::clone(&term);

    let _ = ctrlc_handler(move || {
        term_clone.store(true, Ordering::Relaxed);
    });

    while !term.load(Ordering::Relaxed) {
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    println!("\n正在关闭桌面客户端...");
    server.stop();
    println!("桌面客户端已安全退出。");
}

fn urlencoding(input: &str) -> String {
    let mut out = String::new();
    for b in input.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

/// Simple Windows Console Ctrl+C Handler using windows-sys
fn ctrlc_handler<F>(handler: F) -> Result<(), ()>
where
    F: Fn() + Send + Sync + 'static,
{
    use std::sync::Mutex;
    static HANDLER: Mutex<Option<Box<dyn Fn() + Send + Sync>>> = Mutex::new(None);

    if let Ok(mut lock) = HANDLER.lock() {
        *lock = Some(Box::new(handler));
    }

    unsafe extern "system" fn console_ctrl_handler(dw_ctrl_type: u32) -> i32 {
        if dw_ctrl_type == 0 || dw_ctrl_type == 2 {
            // CTRL_C_EVENT or CTRL_CLOSE_EVENT
            if let Ok(lock) = HANDLER.lock() {
                if let Some(ref cb) = *lock {
                    cb();
                }
            }
            return 1;
        }
        0
    }

    unsafe {
        use windows_sys::Win32::System::Console::SetConsoleCtrlHandler;
        if SetConsoleCtrlHandler(Some(console_ctrl_handler), 1) != 0 {
            Ok(())
        } else {
            Err(())
        }
    }
}
