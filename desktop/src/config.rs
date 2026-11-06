use std::path::PathBuf;

#[derive(Debug, Clone)]
pub enum SubCommand {
    Gui,
    Search { query: String },
    Play {
        series_id: String,
        episode: u32,
        player: String,
    },
    Players,
    Status,
    Help,
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub server_url: String,
    pub client_addr: String,
    pub client_port: u16,
    pub config_dir: PathBuf,
    pub preferred_player: String,
    pub command: SubCommand,
}

impl AppConfig {
    pub fn parse() -> Self {
        let args: Vec<String> = std::env::args().collect();

        let mut server_url = std::env::var("OHG_SERVER_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:5210".to_string());
        let mut client_addr = "127.0.0.1".to_string();
        let mut client_port = 5211;
        let mut preferred_player = "auto".to_string();
        let mut config_dir_override: Option<PathBuf> = None;

        let mut command = SubCommand::Gui;

        // Check if first positional arg is a subcommand
        let mut i = 1;
        if args.len() > 1 && !args[1].starts_with('-') {
            match args[1].as_str() {
                "search" => {
                    let query = if args.len() > 2 {
                        args[2].clone()
                    } else {
                        "".to_string()
                    };
                    command = SubCommand::Search { query };
                    i = 3;
                }
                "play" => {
                    let series_id = if args.len() > 2 {
                        args[2].clone()
                    } else {
                        "".to_string()
                    };
                    command = SubCommand::Play {
                        series_id,
                        episode: 1,
                        player: "auto".to_string(),
                    };
                    i = 3;
                }
                "players" => {
                    command = SubCommand::Players;
                    i = 2;
                }
                "status" => {
                    command = SubCommand::Status;
                    i = 2;
                }
                "help" | "-h" | "--help" => {
                    command = SubCommand::Help;
                    i = 2;
                }
                _ => {}
            }
        }

        while i < args.len() {
            let arg = &args[i];
            if (arg == "-server" || arg == "--server") && i + 1 < args.len() {
                server_url = args[i + 1].clone();
                i += 2;
            } else if (arg == "-port" || arg == "--port") && i + 1 < args.len() {
                if let Ok(p) = args[i + 1].parse::<u16>() {
                    client_port = p;
                }
                i += 2;
            } else if (arg == "-addr" || arg == "--addr") && i + 1 < args.len() {
                client_addr = args[i + 1].clone();
                i += 2;
            } else if (arg == "-player" || arg == "--player") && i + 1 < args.len() {
                preferred_player = args[i + 1].clone();
                if let SubCommand::Play { ref mut player, .. } = command {
                    *player = args[i + 1].clone();
                }
                i += 2;
            } else if (arg == "-ep" || arg == "--ep") && i + 1 < args.len() {
                if let Ok(ep) = args[i + 1].parse::<u32>() {
                    if let SubCommand::Play { ref mut episode, .. } = command {
                        *episode = ep;
                    }
                }
                i += 2;
            } else if (arg == "-config-dir" || arg == "--config-dir") && i + 1 < args.len() {
                config_dir_override = Some(PathBuf::from(&args[i + 1]));
                i += 2;
            } else if arg == "-h" || arg == "--help" {
                command = SubCommand::Help;
                i += 1;
            } else {
                i += 1;
            }
        }

        // Clean server URL
        let mut target = server_url.trim().trim_end_matches('/').to_string();
        if !target.starts_with("http://") && !target.starts_with("https://") {
            target = format!("http://{}", target);
        }

        // Locate data directory
        let config_dir = config_dir_override.unwrap_or_else(|| {
            if let Ok(appdata) = std::env::var("APPDATA") {
                PathBuf::from(appdata).join("openhongguo")
            } else if let Ok(home) = std::env::var("USERPROFILE") {
                PathBuf::from(home).join(".openhongguo")
            } else {
                std::env::temp_dir().join("openhongguo")
            }
        });

        let _ = std::fs::create_dir_all(&config_dir);

        Self {
            server_url: target,
            client_addr,
            client_port,
            config_dir,
            preferred_player,
            command,
        }
    }
}

pub struct PidManager {
    path: PathBuf,
}

impl PidManager {
    pub fn acquire(config_dir: &std::path::Path) -> Option<Self> {
        let path = config_dir.join("ohg-desktop.pid");

        // Check if an existing PID is still alive
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(old_pid) = content.trim().parse::<u32>() {
                    if is_process_running(old_pid) {
                        eprintln!("警告: 另一个桌面客户端实例正在运行 (PID: {})", old_pid);
                    }
                }
            }
        }

        // Write current PID
        let current_pid = std::process::id();
        if std::fs::write(&path, current_pid.to_string()).is_ok() {
            Some(Self { path })
        } else {
            None
        }
    }
}

impl Drop for PidManager {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

/// Checks whether a process with the given PID is currently active on Windows.
fn is_process_running(pid: u32) -> bool {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle != 0 {
            CloseHandle(handle);
            true
        } else {
            false
        }
    }
    #[cfg(not(windows))]
    {
        false
    }
}
