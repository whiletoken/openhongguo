# Multi-stage Dockerfile for OpenHongguo Server + Web Frontend
# Stage 1: Build the Go server with embedded web frontend
FROM golang:1.24-alpine AS builder

WORKDIR /src

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

# Cache go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy source tree
COPY . .

# Build headless ohg-server with optimizations (-s -w strips debug symbols)
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/ohg-server ./cmd/ohg-server

# Stage 2: Minimal runtime image with FFmpeg for DRM decryption and streaming
FROM alpine:3.20

# Install runtime dependencies: FFmpeg for media decryption, CA certificates, timezone data
RUN apk add --no-cache ffmpeg ca-certificates tzdata \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy compiled binary from builder
COPY --from=builder /app/ohg-server /usr/local/bin/ohg-server

# Create data and cache directories
RUN mkdir -p /data /cache

# Default environment configuration
ENV OHG_ADDR=0.0.0.0 \
    OHG_PORT=5210 \
    OHG_CONFIG_DIR=/data \
    OHG_CACHE_DIR=/cache \
    TZ=Asia/Shanghai

# Expose HTTP port
EXPOSE 5210

# Persistent volumes for device profile, history and media cache
VOLUME ["/data", "/cache"]

# Run the server
ENTRYPOINT ["ohg-server"]
