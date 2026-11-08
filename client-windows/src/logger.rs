use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static FILE_LOGGER: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Initializes the logging system with both console (env_logger) and persistent file logging.
pub fn init(config_dir: &Path) {
    let log_dir = config_dir.join("logs");
    let _ = create_dir_all(&log_dir);
    let log_file = log_dir.join("ohg-desktop.log");

    if let Ok(mut guard) = FILE_LOGGER.lock() {
        *guard = Some(log_file.clone());
    }

    let file_target = log_file.clone();

    // Configure env_logger to write formatted output to console and file
    let env = env_logger::Env::default().default_filter_or("info");
    let _ = env_logger::Builder::from_env(env)
        .format(move |buf, record| {
            let ts = buf.timestamp();
            let level = record.level();
            let target = record.target();
            let args = record.args();

            let log_line = format!("[{} {:5} {}] {}", ts, level, target, args);

            // Append to log file
            if let Ok(mut f) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&file_target)
            {
                let _ = writeln!(f, "{}", log_line);
            }

            writeln!(buf, "{}", log_line)
        })
        .try_init();

    log::info!("OpenHongguo 桌面端日志系统已初始化, 日志路径: {}", log_file.display());
}
