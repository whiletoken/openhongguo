# OpenHongguo Windows Client (openhongguo-client-windows)

OpenHongguo Windows 原生桌面客户端模块，基于 Rust 编写。提供无边框原生独立应用窗口、本地 UI 服务嵌入、开源播放器探测与调度，以及与 OpenHongguo 后端服务的高性能联动。

## 模块架构

```
client-windows/
├── pom.xml                     # Maven 子模块构建定义
├── Cargo.toml                  # Cargo 包清单与依赖定义
├── Cargo.lock                  # 依赖锁定版本
├── README.md                   # 客户端文档
└── src/
    ├── main.rs                 # 客户端命令行与 GUI 启动主入口、信号处理与生命周期
    ├── assets.rs               # 静态前端资源加载器 (二进制内嵌 fallback + 磁盘动态优先探测)
    ├── client.rs               # 强类型 HTTP Client (与 ohg-server 后台通信)
    ├── config.rs               # 命令行参数解析与单实例 PID 文件排他控制
    ├── player.rs               # 外部开源播放器嗅探 (FFplay / MPV / VLC) 与子进程拉起
    ├── server.rs               # 本地轻量化 HTTP UI 服务 (tiny_http 实现)
    └── window.rs               # Windows 原生无边框桌面 App 窗口调度与唤起
```

## 功能特性

- **原生独立窗口**：无需安装庞大的 Electron 运行环境，基于 Windows 原生 WebView/应用容器以极低内存占用拉起沉浸式桌面客户端。
- **开源播放器集成**：自动嗅探系统中安装的 `mpv`、`ffplay`、`vlc` 等开源媒体播放器，支持硬件加速无损解码播放。
- **离线内嵌前端**：编译期直接将 `web/` 资源压入客户端二进制包，即使没有外置前端目录也能单文件独立运行；同时在开发环境下支持热重载读取磁盘前端文件。
- **单实例互斥管理**：基于 Windows 原生 PID 管理机制，防止多开实例引发的端口冲突与资源竞争。

## 编译与运行

### 方式一：Maven 构建 (推荐)
在项目根目录执行：
```bash
mvn compile -pl client-windows
```

### 方式二：Make 构建
在项目根目录执行：
```bash
make windows
```

### 方式三：Cargo 构建
在 `client-windows` 目录下执行：
```bash
cargo build --release
```
编译产物位于 `target/release/ohg-desktop.exe`，构建脚本会自动同步至根目录 `bin/ohg-desktop.exe`。

### 启动客户端
```bash
# GUI 独立窗口模式 (默认连接本地 127.0.0.1:5210)
.\bin\ohg-desktop.exe

# 命令行搜索短剧
.\bin\ohg-desktop.exe search 赘婿

# 命令行使用指定开源播放器播放
.\bin\ohg-desktop.exe play 7389148567117188159 --ep 1 --player mpv

# 查看系统中已安装并就绪的开源播放器
.\bin\ohg-desktop.exe players

# 检查服务端连通性状态
.\bin\ohg-desktop.exe status
```
