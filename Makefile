# OpenHongguo 统一构建入口：支持 Make、Maven、Docker 和原生构建工具。make help 列出所有目标。

.PHONY: help build maven-build maven-clean binaries cli server windows desktop test test-go test-windows \
	clean docker-build docker-up docker-down sdk-fetch

help: ## 列出所有目标
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-18s %s\n", $$1, $$2}'

build: binaries ## 构建全部二进制产物 (Server, Windows Client, Upstream CLI)

maven-build: ## 使用 Maven 反应堆一键编译所有模块 (mvn compile)
	mvn compile

maven-clean: ## 使用 Maven 清理构建产物 (mvn clean)
	mvn clean

binaries: cli server windows ## 构建全部平台二进制产物 (CLI, Server, Windows Client)

cli: ## 集成并构建上游 SDK 命令行工具 bin/ohg (从 go.mod 声明的上游 SDK 编译)
	go build -ldflags="-s -w" -o bin/ohg github.com/beilunyang/openhongguo/cmd/ohg

server: ## 构建 Web API 与流媒体服务端 bin/ohg-server
	go build -ldflags="-s -w" -o bin/ohg-server ./server/cmd/ohg-server

windows: ## 构建 Windows 桌面客户端 (Rust) bin/ohg-desktop.exe
	cd client-windows && cargo build --release
	@mkdir -p bin
	@cp client-windows/target/release/ohg-desktop.exe bin/ohg-desktop.exe 2>/dev/null || cp client-windows/target/release/ohg-desktop bin/ohg-desktop 2>/dev/null || true

desktop: windows ## 兼容别名：构建 Windows 桌面客户端

sdk-fetch: ## 更新/拉取最新上游 SDK 依赖与 CLI 工具
	go get -u github.com/beilunyang/openhongguo@v0.3.0
	go mod tidy
	go build -ldflags="-s -w" -o bin/ohg github.com/beilunyang/openhongguo/cmd/ohg

test: test-go test-windows ## 运行全模块测试

test-go: ## 运行 Go 服务端单元测试
	go vet ./server/...
	go test ./server/...

test-windows: ## 运行 Windows 客户端 (Rust) 单元测试
	cd client-windows && cargo test

docker-build: ## 使用 docker/Dockerfile 构建 openhongguo 镜像
	docker build -f docker/Dockerfile -t openhongguo:latest .

docker-up: ## 使用 docker compose 后台构建并启动服务
	docker compose -f docker/docker-compose.yml up -d --build

docker-down: ## 停止并清理 docker compose 容器服务
	docker compose -f docker/docker-compose.yml down

clean: ## 清理构建产物与临时文件
	rm -rf bin dist client-windows/target
