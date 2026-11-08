# OpenHongguo Web (openhongguo-web)

OpenHongguo Web 前端客户端模块，采用现代原生 HTML5、CSS3 与模块化 JavaScript (ES6+) 构建，零重型框架依赖，具备轻量、极速首屏与高响应度特性。

## 模块架构

```
web/
├── pom.xml                     # Maven 子模块构建定义
├── package.json                # 前端工程元数据描述
├── README.md                   # Web 端模块说明文档
├── index.html                  # 单页面应用 (SPA) 主入口
├── web.go                      # Go embed 静态资源嵌入桥接器
├── css/                        # 模块化样式表目录
│   ├── base.css                # 核心设计变量、重置样式与主题 tokens
│   ├── layout.css              # 左侧主菜单栏、顶部搜索栏与右侧内容区栅格
│   ├── components.css          # 卡片、按钮、弹窗、骨架屏与通用控件
│   ├── catalog.css             # 剧集流网格、分类选择器与榜单瀑布流
│   ├── theater.css             # 沉浸式影院模式、竖屏/横屏自适应与控制栏
│   ├── responsive.css          # 多端断点媒体查询 (桌面、移动端、大屏沉浸)
│   └── app.css                 # 样式统一聚合入口
└── js/                         # 模块化 JavaScript 脚本目录
    ├── state.js                # 全局响应式状态总线
    ├── api.js                  # 与后端 ohg-server 的 RESTful API 通信层
    ├── utils.js                # 时间格式化、节流防抖、Toast 与 DOM 工具
    ├── navigation.js           # 页面路由与侧边栏 Tab 切换调度
    ├── catalog.js              # 剧集检索、分类筛选与触底流式加载
    ├── episodes.js             # 选集抽屉、30集智能分段分页与多集预览
    ├── player.js               # 播放生命周期抽象层与事件分发
    ├── artplayer.js            # ArtPlayer 高性能网页播放器深度定制与集成
    ├── theater_layout.js       # 影院剧场模式、多比例切换 (9:16 / 16:9) 与全屏扩展
    ├── shortcuts.js            # 键盘快捷键响应 (空格暂停/播放、方向键快进等)
    ├── favorites.js            # 本地与云端短剧收藏夹同步
    ├── history.js              # 观看进度记录与断点秒级断点续播
    ├── search_history.js       # 搜索关键词历史记录与快速联想
    ├── settings.js             # 客户端设置中心 (播放源、默认画质、播放器首选项)
    ├── cache_sync.js           # 本地缓存与后端数据双向同步
    └── app.js                  # 前端应用程序启动与总线装配入口
```

## 功能特性

1. **影院模式自适应**：原生支持 9:16 移动竖屏短剧与 16:9 传统比例切换，支持沉浸式剧场扩展与右侧选集面板显隐控制。
2. **大尺寸选集分页**：针对百集长短剧设计 30 集分段大号页码模块，流畅滚动与快速定位。
3. **断点精准续播**：毫秒级进度保存，切集、刷新或重启自动定位上次观看位置。
4. **嵌入式无缝打包**：通过 `web.go` 内置的 `embed.FS`，由 `server` 与 `client-windows` 在编译期一键内嵌为单一可执行文件，开箱即用。

## 运行与预览

- 通过服务端启动：运行根目录 `start-web.bat` 或 `.\bin\ohg-server.exe -open=true`，浏览器将自动打开 `http://127.0.0.1:5210`。
- 本地静态调试：任意静态 Web 服务器（如 `python -m http.server 8000` 或 VS Code Live Server）均可直接预览。
