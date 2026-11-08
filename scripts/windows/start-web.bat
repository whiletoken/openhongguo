@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: 确定项目根目录与产物路径
for %%I in ("%~dp0..\..") do set "ROOT_DIR=%%~fI"

set "BIN_DIR=%ROOT_DIR%\bin"
set "TARGET_EXE=%BIN_DIR%\ohg-server.exe"

title 红果短剧 - Web 服务与浏览器播放器
echo ========================================================
echo   红果短剧 (OpenHongguo) - 服务端 + Web 端模式
echo ========================================================
echo 正在启动后台服务并打开浏览器...

if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"

if not exist "%TARGET_EXE%" (
    echo 正在首次编译 ohg-server.exe 至 bin/ 目录...
    cd /d "%ROOT_DIR%"
    go build -ldflags="-s -w" -o "%TARGET_EXE%" ./server/cmd/ohg-server
    if !errorlevel! neq 0 (
        echo.
        echo [错误] 编译失败，请检查 Go 开发环境配置与网络依赖。
        pause
        exit /b 1
    )
)

cd /d "%ROOT_DIR%"
"%TARGET_EXE%" -open=true %*
if !errorlevel! neq 0 (
    pause
)
