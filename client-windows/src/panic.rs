use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::Path;

/// Sets up a global panic hook to intercept unhandled panics, record detailed stack/error information
/// to disk, and inform the user via dialog and log messages.
pub fn setup_panic_hook(config_dir: &Path) {
    let crash_dir = config_dir.join("logs");
    let _ = create_dir_all(&crash_dir);
    let crash_file = crash_dir.join("crash.log");

    std::panic::set_hook(Box::new(move |panic_info| {
        let payload = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "未知异常类型 (Unknown panic payload)".to_string()
        };

        let location = if let Some(loc) = panic_info.location() {
            format!("{}:{}:{}", loc.file(), loc.line(), loc.column())
        } else {
            "未知代码位置".to_string()
        };

        let thread_name = std::thread::current()
            .name()
            .unwrap_or("unnamed")
            .to_string();

        let time_str = format!("{:?}", std::time::SystemTime::now());
        let crash_msg = format!(
            "==================== 异常崩溃报告 (Crash Report) ====================\n\
             时间: {}\n\
             线程: {}\n\
             位置: {}\n\
             原因: {}\n\
             =====================================================================",
            time_str, thread_name, location, payload
        );

        // 1. Output to standard error
        eprintln!("\n{}", crash_msg);

        // 2. Output to log system
        log::error!("{}", crash_msg);

        // 3. Write to persistent crash log file
        if let Ok(mut f) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&crash_file)
        {
            let _ = writeln!(f, "{}\n", crash_msg);
        }

        // 4. Pop up Windows message box to alert the user
        show_error_dialog(
            "OpenHongguo 桌面端异常终止",
            &format!(
                "客户端发生严重异常，已生成崩溃日志。\n\n\
                 错误信息: {}\n\
                 代码位置: {}\n\n\
                 详细日志已保存至:\n{}",
                payload,
                location,
                crash_file.display()
            ),
        );
    }));
}

#[cfg(windows)]
fn show_error_dialog(title: &str, content: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONERROR, MB_OK, MB_TASKMODAL,
    };

    let wide_title: Vec<u16> = OsStr::new(title)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let wide_content: Vec<u16> = OsStr::new(content)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        MessageBoxW(
            0,
            wide_content.as_ptr(),
            wide_title.as_ptr(),
            MB_OK | MB_ICONERROR | MB_TASKMODAL,
        );
    }
}

#[cfg(not(windows))]
fn show_error_dialog(_title: &str, _content: &str) {}
