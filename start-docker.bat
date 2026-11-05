@echo off
chcp 65001 >nul
title 红果短剧 - Docker 打包启动脚本
cd /d "%~dp0"

echo ========================================================
echo   红果短剧 (OpenHongguo) - Docker 一键打包与启动
echo ========================================================
echo.

:: 1. 检查 Docker 是否安装
where docker >nul 2>&1
if %errorlevel% neq 0 goto :no_docker

:: 2. 检查 Docker 服务守护进程是否正在运行
docker info >nul 2>&1
if %errorlevel% neq 0 goto :no_daemon

:: 3. 创建本地持久化目录
if not exist "data" mkdir data
if not exist "cache" mkdir cache

echo [1/3] 正在构建 Docker 镜像并启动容器...
echo.

:: 4. 优先尝试使用 docker compose (v2)
docker compose version >nul 2>&1
if %errorlevel% equ 0 (
    echo 检测到 Docker Compose v2，执行编排构建与启动...
    docker compose up -d --build
    if %errorlevel% equ 0 goto :success
    goto :fail
)

:: 5. 尝试使用 docker-compose (v1)
docker-compose version >nul 2>&1
if %errorlevel% equ 0 (
    echo 检测到 Docker Compose v1，执行编排构建与启动...
    docker-compose up -d --build
    if %errorlevel% equ 0 goto :success
    goto :fail
)

:: 6. 若无 compose，降级使用原生 docker 命令
echo 未检测到 compose，使用原生 docker 命令构建与运行...
docker build -t openhongguo:latest .
if %errorlevel% neq 0 goto :build_fail

echo 正在停止并移除旧容器(若存在)...
docker stop openhongguo >nul 2>&1
docker rm openhongguo >nul 2>&1

echo 正在启动新容器...
docker run -d --name openhongguo -p 5210:5210 -v "%cd%\data:/data" -v "%cd%\cache:/cache" --restart unless-stopped openhongguo:latest
if %errorlevel% equ 0 goto :success
goto :fail

:no_docker
echo [错误] 未检测到 Docker 运行环境！
echo 请先安装 Docker 或 Docker Desktop，并确保将 docker 添加至系统 PATH。
echo 官方下载地址: https://www.docker.com/products/docker-desktop/
echo.
pause
exit /b 1

:no_daemon
echo [错误] Docker 守护进程未启动！
echo 请先打开并启动 Docker Desktop 或 Docker 服务后重试。
echo.
pause
exit /b 1

:build_fail
echo.
echo [错误] Docker 镜像构建失败，请检查上方日志。
echo.
pause
exit /b 1

:fail
echo.
echo [错误] 容器启动失败，请检查 Docker 日志或端口占用情况 (端口 5210)。
echo.
pause
exit /b 1

:success
echo.
echo ========================================================
echo   [成功] 红果短剧 Docker 服务已成功启动！
echo ========================================================
echo.
echo   - Web 访问地址: http://localhost:5210
echo   - 查看实时日志: docker logs -f openhongguo
echo   - 停止容器服务: docker stop openhongguo (或 docker compose down)
echo.
echo 正在尝试为您打开浏览器访问...
start http://localhost:5210
echo.
pause
exit /b 0
