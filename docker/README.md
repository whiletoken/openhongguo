# OpenHongguo Docker (openhongguo-docker)

OpenHongguo 容器化构建与编排模块。针对生产与私有服务器部署深度优化，集成了 BuildKit 多阶段构建缓存加速、国内镜像源优化、持久化卷挂载与健康检查探活。

## 目录结构

```
docker/
├── pom.xml                     # Maven 子模块描述
├── Dockerfile                  # 极速多阶段 Docker 镜像构建描述文件
├── docker-compose.yml          # Docker Compose 容器编排配置
├── .dockerignore               # 镜像构建上下文忽略规则
├── README.md                   # 模块使用与运维指南
├── start-docker.bat            # 适用于 Windows 环境的一键启动脚本
└── start-docker.sh             # 适用于 Linux / macOS 环境的一键启动脚本
```

## 关键技术特性

1. **国内加速源预设**：构建阶段与运行阶段默认选用阿里云 Alpine 镜像源与 `goproxy.cn`，解决海外网络缓慢与超时问题。
2. **BuildKit 缓存挂载**：使用 `--mount=type=cache` 挂载 Go 模块缓存与构建缓存，二次构建秒级完成。
3. **极简运行时体积**：基于轻量 Alpine 运行时镜像，内置经过安全加固的 FFmpeg 解码器与 CA 根证书。
4. **秒级健康检查探活**：容器内置 `HEALTHCHECK`，通过定时探针轮询 `/api/system/status`，保障服务高可用。

## 常用命令

### 1. 使用 Docker Compose 一键启动 (推荐)
```bash
# 在根目录下启动服务
docker compose -f docker/docker-compose.yml up -d --build

# 或进入 docker 目录启动服务
cd docker && docker compose up -d --build

# 查看运行状态与日志
docker logs -f openhongguo

# 停止并移除容器
docker compose -f docker/docker-compose.yml down
```

### 2. 使用原生 Docker 命令
```bash
# 构建镜像
docker build -f docker/Dockerfile -t openhongguo:latest .

# 启动容器
docker run -d \
  --name openhongguo \
  -p 5210:5210 \
  -v ./data:/data \
  -v ./cache:/cache \
  --restart unless-stopped \
  openhongguo:latest
```

### 3. 一键批处理脚本
- Windows: 双击运行根目录 `start-docker.bat` 或 `docker/start-docker.bat`
- Linux/macOS: 执行根目录 `./start-docker.sh` 或 `docker/start-docker.sh`
