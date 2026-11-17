# OpenHongguo Server (openhongguo-server)

OpenHongguo 后端服务模块，采用 Go 语言实现。本项目改变了以往维护上游全量 Fork 源码的思路，**彻底解耦并主动集成上游官方编译包 SDK (`github.com/beilunyang/openhongguo@v0.3.0`)**。

上游 SDK 负责协议逆向工程、匿名设备维护与 Argus/Ladon 动态签名计算；OpenHongguo 服务端则聚焦于提供面向 Web/桌面端的 RESTful API、智能反审查/抗投毒 DNS 传输 (SmartTransport)、滑动窗口并发预缓存、流媒体本地代理解密、追剧收藏与播放历史管理。

## 模块架构

```
server/
├── pom.xml                     # Maven 子模块构建定义 (构建 ohg-server 并自动集成上游 CLI SDK)
├── README.md                   # 服务端模块说明文档
├── cmd/
│   └── ohg-server/             # HTTP API & Web 静态资源托管服务端主入口
└── internal/                   # 核心业务逻辑
    ├── webserver/              # RESTful API 路由、流媒体代理、智能传输、弹幕接口与 PID 单例互斥
    ├── favorite/               # 剧集收藏夹持久化存储引擎 (JSON Store)
    ├── history/                # 播放历史进度与断点续播持久化引擎
    ├── logger/                 # 高性能结构化日志 (Zap + Lumberjack) 与 SafeGo 异常容灾
    └── media/                  # 外部播放器调度引擎 (MPV / FFplay / VLC / FFmpeg)
```

## 核心设计改进 (主动集成上游 SDK)

1. **零源码负担与持续升级**:
   - 移除原先冗余的 bindings (Flutter/React Native/Node/Mobile) 与协议测试用例，代码库极为轻量（仅专注播放与服务）。
   - 在 `go.mod` 中显式声明依赖 `github.com/beilunyang/openhongguo v0.3.0`，全面获得 Argus 551 / Ladon 签名支持与弹幕 API (`ListDanmaku`)。
2. **上游工具链编译包集成**:
   - 通过 `scripts/integrate-upstream-sdk.ps1` (或 `scripts/integrate-upstream-sdk.sh`) 及 `Makefile`/`pom.xml`，自动拉取并编译集成上游 `ohg` 命令行工具到 `bin/ohg.exe`。
3. **健壮的 SmartTransport**:
   - 集成 Public DNS (AliDNS / DNSPod / 114) 自动探测与 Fallback，规避针对 `log5-applog-lq.fqnovel.com` 等域名的广告过滤黑洞 (0.0.0.0)。
4. **全套结构化日志与 Panic 保护**:
   - Uber Zap + Lumberjack 自动滚动归档，全局 HTTP Panic 中间件与 `SafeGoNamed` 保护所有后台协程。

## 编译与运行

### 方式一：Maven 构建 (推荐)
在根工程或 `server` 目录下执行：
```bash
mvn compile -pl server
```

### 方式二：Make 构建
```bash
make server       # 编译服务端 bin/ohg-server
make cli          # 编译集成上游 CLI bin/ohg
make sdk-fetch    # 检查并更新最新上游 SDK
```

### 方式三：原生 Go 命令
```bash
# 构建服务端
go build -ldflags="-s -w" -o bin/ohg-server.exe ./server/cmd/ohg-server

# 编译集成上游 CLI SDK
go build -ldflags="-s -w" -o bin/ohg.exe github.com/beilunyang/openhongguo/cmd/ohg
```

### 启动服务
```bash
# 启动后台服务 (默认监听 0.0.0.0:5210)
.\bin\ohg-server.exe

# 启动并自动在浏览器中打开 Web 播放页面
.\bin\ohg-server.exe -open=true

# 自定义端口与日志级别
.\bin\ohg-server.exe -addr 0.0.0.0 -port 5210 -log-level info
```

## RESTful API 概览

| 接口路径 | 方法 | 功能描述 |
| :--- | :--- | :--- |
| `/api/system/status` | GET | 服务端健康状态检查与环境播放器探针 |
| `/api/discover` | GET | 发现频道精选剧集推荐 |
| `/api/search?q={关键词}` | GET | 全网检索短剧（支持分页与光标游标） |
| `/api/series?id={剧ID}` | GET | 获取短剧详细信息与关联信息 |
| `/api/episodes?series_id={剧ID}` | GET | 获取指定短剧的完整选集列表及单集元数据 |
| `/api/playback?episode_id={集ID}`| GET | 实时解析视频播放流（带 Argus/Ladon 校验）及 DRM 密钥材料 |
| `/api/danmaku?series_id={剧ID}&episode_id={集ID}` | GET | 读取分集实时弹幕（支持时间切片分页） |
| `/api/stream?episode_id={集ID}` | GET | 本地流媒体解密/缓存代理播放流 |
| `/api/favorites` | GET / POST / DELETE | 用户短剧收藏夹增删改查 |
| `/api/history` | GET / POST / DELETE | 播放进度保存、断点续播与历史记录管理 |
| `/api/play_external` | POST | 唤起 MPV / FFplay / VLC 外部播放器原生串流 |
