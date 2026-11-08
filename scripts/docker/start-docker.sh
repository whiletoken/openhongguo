#!/usr/bin/env bash
# ========================================================
#   红果短剧 (OpenHongguo) - Docker 一键打包与启动脚本
# ========================================================

set -e

# 定位到项目根目录
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." >/dev/null 2>&1 && pwd)"
cd "$ROOT_DIR"

# 启用 Docker BuildKit 极速构建引擎与编译缓存
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

echo "========================================================"
echo "  红果短剧 (OpenHongguo) - Docker 一键打包与启动"
echo "========================================================"
echo ""

# 1. 检查 Docker 是否安装
if ! command -v docker >/dev/null 2>&1; then
    echo "[错误] 未检测到 Docker，请先安装 Docker！"
    echo "Linux 快速安装命令: curl -fsSL https://get.docker.com | bash"
    exit 1
fi

# 2. 检查 Docker 守护进程是否运行
if ! docker info >/dev/null 2>&1; then
    echo "[错误] Docker 服务未运行，请先启动 Docker 服务 (例如: sudo systemctl start docker)"
    exit 1
fi

# 3. 创建本地持久化目录
mkdir -p data cache

# 4. 构建并启动容器
echo "[1/2] 正在使用 BuildKit 极速构建 Docker 镜像并启动容器..."
if docker compose version >/dev/null 2>&1; then
    echo "检测到 Docker Compose v2，执行编排构建与启动..."
    docker compose -f "$ROOT_DIR/docker/docker-compose.yml" up -d --build
elif command -v docker-compose >/dev/null 2>&1; then
    echo "检测到 Docker Compose v1，执行编排构建与启动..."
    docker-compose -f "$ROOT_DIR/docker/docker-compose.yml" up -d --build
else
    echo "未检测到 compose，使用原生 docker 命令构建与运行..."
    docker build -f "$ROOT_DIR/docker/Dockerfile" -t openhongguo:latest .
    docker stop openhongguo >/dev/null 2>&1 || true
    docker rm openhongguo >/dev/null 2>&1 || true
    docker run -d \
      --name openhongguo \
      -p 5210:5210 \
      -v "$ROOT_DIR/data:/data" \
      -v "$ROOT_DIR/cache:/cache" \
      --restart unless-stopped \
      openhongguo:latest
fi

echo ""
echo "========================================================"
echo "  [成功] 红果短剧 Docker 服务已成功启动！"
echo "========================================================"
echo "  - Web 访问地址: http://localhost:5210"
echo "  - 查看实时日志: docker logs -f openhongguo"
echo "  - 停止容器服务: docker stop openhongguo (或 docker compose down)"
echo "========================================================"
