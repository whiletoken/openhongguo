# Multi-stage Dockerfile for OpenHongguo Server + Web Frontend
# 参考 MiyoQian 速度优化最佳实践：
# 1. 软件源替换为国内镜像 (阿里云)，极速拉取系统包与 FFmpeg
# 2. Go 代理加速 (goproxy.cn) 与模块层缓存
# 3. Docker BuildKit 编译缓存挂载 (--mount=type=cache)
# 4. 精准复制业务代码，最大化利用分层缓存
# 5. 最小化运行时镜像与健康检查探活

ARG GOLANG_IMAGE=golang:1.24-alpine
ARG RUNTIME_IMAGE=alpine:3.20
ARG ALPINE_MIRROR=mirrors.aliyun.com
ARG GOPROXY=https://goproxy.cn,direct

# ==================== Stage 1: 构建阶段 ====================
FROM ${GOLANG_IMAGE} AS builder

ARG ALPINE_MIRROR
ARG GOPROXY

WORKDIR /src

# 替换 Alpine 软件源为国内镜像，加速基础开发依赖安装
RUN if [ -n "${ALPINE_MIRROR}" ]; then \
        sed -i "s/dl-cdn.alpinelinux.org/${ALPINE_MIRROR}/g" /etc/apk/repositories; \
    fi \
    && apk add --no-cache git ca-certificates tzdata

ENV GOPROXY=${GOPROXY} \
    CGO_ENABLED=0 \
    GOOS=linux

# 优先复制依赖定义（利用 Docker 缓存层，通配符 go.sum* 兼容有无校验文件）
COPY go.mod go.sum* ./
RUN go mod download

# 精确复制服务端与 Web 端必需源码（避免其他无关文件变更破坏编译缓存）
COPY adapters/ ./adapters/
COPY cmd/ohg-server/ ./cmd/ohg-server/
COPY internal/ ./internal/
COPY sdk/ ./sdk/
COPY web/ ./web/

# 使用 BuildKit 缓存挂载编译，大幅加速二次构建速度
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags="-s -w" -o /app/ohg-server ./cmd/ohg-server

# ==================== Stage 2: 运行阶段 ====================
FROM ${RUNTIME_IMAGE} AS runner

ARG ALPINE_MIRROR

# 替换 Alpine 软件源为国内镜像，极速安装 FFmpeg 媒体解码工具与 CA 证书
RUN if [ -n "${ALPINE_MIRROR}" ]; then \
        sed -i "s/dl-cdn.alpinelinux.org/${ALPINE_MIRROR}/g" /etc/apk/repositories; \
    fi \
    && apk add --no-cache ffmpeg ca-certificates tzdata \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# 从构建阶段仅复制最终二进制文件
COPY --from=builder /app/ohg-server /usr/local/bin/ohg-server

# 创建持久化数据与解密流缓存目录
RUN mkdir -p /data /cache

# 默认环境变量配置
ENV OHG_ADDR=0.0.0.0 \
    OHG_PORT=5210 \
    OHG_CONFIG_DIR=/data \
    OHG_CACHE_DIR=/cache \
    TZ=Asia/Shanghai

EXPOSE 5210

VOLUME ["/data", "/cache"]

# 容器健康检查（基于 Alpine 内置 wget，秒级快速探活）
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:5210/api/system/status || exit 1

ENTRYPOINT ["ohg-server"]
