# OpenHongguo Server (openhongguo-server)

OpenHongguo 后端服务与核心 SDK 模块，采用 Go 语言实现。负责红果短剧协议解析、流媒体解密调度、设备档案注册、收藏夹/历史记录持久化以及提供供 Web 端与客户端消费的高性能 RESTful API。

## 模块架构

```
server/
├── pom.xml                     # Maven 子模块构建定义
├── README.md                   # 服务端模块文档
├── cmd/
│   ├── ohg-server/             # HTTP API & Web 静态资源托管服务端入口
│   └── ohg/                    # 终端交互式命令行客户端入口 (CLI)
├── internal/                   # 内部核心业务领域实现
│   ├── webserver/              # HTTP 路由、流媒体反向代理、PID 互斥与智能重试传输
│   ├── protocol/               # 移动端私有通信协议签名与匿名设备激活注册
│   ├── drm/                    # CENC-AES-CTR 流媒体解密逆向逻辑与密钥解包
│   ├── favorite/               # 追剧收藏夹持久化存储引擎
│   ├── history/                # 播放历史进度与断点续播存储引擎
│   ├── media/                  # 媒体播放器进程管道调度 (FFplay / MPV / VLC / FFmpeg)
│   ├── cliapp/                 # 命令行控制台终端交互驱动
│   └── contract/               # 契约测试与 API 模式定义
├── adapters/                   # 存储与传输适配器层
│   ├── filestore/              # 基于 JSON 文件的原子化本地配置存储
│   ├── httptransport/          # 带自动重试与 User-Agent 伪装的 HTTP Client
│   └── memstore/               # 内存型瞬时存储 (用于测试)
├── sdk/                        # 官方 Go 核心 SDK
│   ├── client.go               # SDK 核心门面客户端
│   ├── books.go                # 短剧详情、剧集选集与推荐检索
│   ├── media.go                # 流媒体播放信息与直链解析
│   ├── person.go               # 创作者与用户信息查询
│   └── model/                  # 强类型数据模型定义
└── bindings/                   # 跨平台语言绑定 (Mobile / Node / Flutter / React Native)
```

## 编译与运行

### 方式一：Maven 构建 (推荐)
在项目根目录或 `server` 目录下执行：
```bash
mvn compile -pl server
```

### 方式二：Make 构建
在项目根目录下执行：
```bash
make server   # 编译 bin/ohg-server
make cli      # 编译 bin/ohg
```

### 方式三：原生 Go 命令
```bash
# 构建服务端
go build -ldflags="-s -w" -o ../bin/ohg-server.exe ./cmd/ohg-server

# 构建命令行工具
go build -ldflags="-s -w" -o ../bin/ohg.exe ./cmd/ohg
```

### 启动服务
```bash
# 启动后台服务 (默认监听 127.0.0.1:5210)
.\bin\ohg-server.exe

# 启动并自动在浏览器中打开 Web 播放页面
.\bin\ohg-server.exe -open=true

# 自定义端口与绑定地址
.\bin\ohg-server.exe -addr 0.0.0.0 -port 5210

# 配置日志级别与日志保存目录 (支持 debug / info / warn / error)
.\bin\ohg-server.exe -log-level debug -log-dir ./logs
```

## 日志输出与异常容灾

服务端引入了业界成熟的开源库组合进行工程化改造，保障高并发与长时运行的稳定性：
1. **高性能结构化日志 (Uber Zap + Lumberjack)**:
   - 控制台彩色分级输出与滚动日志文件归档（按大小自动切割、压缩备份）。
   - 全局 HTTP Access Log 中间件，自动记录客户端 IP、请求方法、URI、状态码、响应耗时（ms）与链路 `X-Request-ID`。
2. **全局异常恢复与安全容灾 (Panic Recovery & SafeGo)**:
   - 全局 HTTP 中间件拦截 Handler Panic，记录完整堆栈跟踪，并向前端返回结构化 JSON 500 错误响应，避免连接悬挂或服务崩溃。
   - `SafeGo` / `SafeGoNamed` 机制全面保护流媒体下载、预缓存及播放器调用等后台 Goroutine，确保单任务异常不会导致主进程退出。

## RESTful API 概览

| 接口路径 | 方法 | 功能描述 |
| :--- | :--- | :--- |
| `/api/system/status` | GET | 服务端健康状态检查与版本探活 |
| `/api/catalog/search?q={关键词}` | GET | 全网检索短剧（支持分页与分类过滤） |
| `/api/catalog/episodes?id={剧集ID}` | GET | 获取指定短剧的完整选集列表及单集元数据 |
| `/api/catalog/stream?ep_id={集ID}&series_id={剧ID}&q={画质}` | GET | 实时解析流媒体直链与解密密钥 |
| `/api/favorite` | GET / POST / DELETE | 用户短剧收藏夹增删改查 |
| `/api/history` | GET / POST / DELETE | 播放进度保存、断点续播与历史记录管理 |
