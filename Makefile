# openhongguo 统一构建入口：支持 Make、Maven、Docker 和原生构建工具。make help 列出所有目标。

# gomobile 和 gobind 装在 GOPATH/bin。
export PATH := $(shell go env GOPATH)/bin:$(PATH)
# macOS 上的默认位置；已经设置时沿用。
ANDROID_HOME ?= $(HOME)/Library/Android/sdk
export ANDROID_HOME
ifeq ($(JAVA_HOME),)
ifneq ($(wildcard /Applications/Android\ Studio.app/Contents/jbr/Contents/Home),)
export JAVA_HOME := /Applications/Android Studio.app/Contents/jbr/Contents/Home
endif
endif

.PHONY: help build maven-build maven-clean binaries cli server windows desktop node mobile gen test test-go test-windows \
	test-node test-react-native test-flutter test-mobile test-android test-ios clean docker-build docker-up docker-down

help: ## 列出所有目标
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-18s %s\n", $$1, $$2}'

build: binaries node mobile ## 构建全部 Go 二进制产物、Node.js 包和全部移动端包

maven-build: ## 使用 Maven 反应堆一键编译所有模块 (mvn compile)
	mvn compile

maven-clean: ## 使用 Maven 清理构建产物 (mvn clean)
	mvn clean

binaries: cli server windows ## 构建全部平台二进制产物 (CLI, Server, Windows Client)

cli: ## 构建服务端命令行工具 bin/ohg
	go build -ldflags="-s -w" -o bin/ohg ./server/cmd/ohg

server: ## 构建 Web API 与流媒体服务端 bin/ohg-server
	go build -ldflags="-s -w" -o bin/ohg-server ./server/cmd/ohg-server

windows: ## 构建 Windows 桌面客户端 (Rust) bin/ohg-desktop.exe
	cd client-windows && cargo build --release
	@mkdir -p bin
	@cp client-windows/target/release/ohg-desktop.exe bin/ohg-desktop.exe 2>/dev/null || cp client-windows/target/release/ohg-desktop bin/ohg-desktop 2>/dev/null || true

desktop: windows ## 兼容别名：构建 Windows 桌面客户端

node: ## 构建 Node.js 包（wasm）
	cd server/bindings/node && npm run build

mobile: ## 编译 Go core，构建 Android、iOS、React Native 和 Flutter 包
	server/bindings/mobile/build.sh all

gen: ## 修改 sdk 的类型或注释后，重新生成各语言的类型和文档
	go run ./server/bindings/node/tsgen > server/bindings/node/types.d.ts
	go run ./server/bindings/node/tsgen > server/bindings/react-native/src/types.ts
	go run ./server/bindings/mobile/gen
	go run ./server/bindings/docgen

test: test-go test-windows test-node test-react-native test-flutter ## 运行全模块测试

test-go: ## 运行 Go 服务端与 SDK 单元测试
	go vet ./server/...
	go test ./server/...

test-windows: ## 运行 Windows 客户端 (Rust) 单元测试
	cd client-windows && cargo test

test-node: ## 构建 Node.js 包并运行测试
	cd server/bindings/node && npm run build && npm test

test-react-native: ## 编译 React Native 包并运行测试
	cd server/bindings/react-native && (test -d node_modules || npm ci) && npm test

test-flutter: ## 运行 Flutter 包的测试
	cd server/bindings/flutter && flutter test

test-mobile: test-android test-ios ## 运行需要 gomobile、Android SDK 和 Xcode 的测试

test-android: ## 编译 Android 版 core，运行 Kotlin 单元测试并打包 aar
	server/bindings/mobile/build.sh android

test-ios: ## 编译 iOS 版 core，在 macOS 上运行 Swift 测试
	server/bindings/mobile/build.sh ios
	cd server/bindings/mobile/ios && swift test

docker-build: ## 使用 docker/Dockerfile 构建 openhongguo 镜像
	docker build -f docker/Dockerfile -t openhongguo:latest .

docker-up: ## 使用 docker compose 后台构建并启动服务
	docker compose -f docker/docker-compose.yml up -d --build

docker-down: ## 停止并清理 docker compose 容器服务
	docker compose -f docker/docker-compose.yml down

clean: ## 清理构建产物与临时文件
	rm -rf bin dist client-windows/target
