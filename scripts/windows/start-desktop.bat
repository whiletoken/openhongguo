@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: 确定项目根目录与产物路径
for %%I in ("%~dp0..\..") do set "ROOT_DIR=%%~fI"

set "BIN_DIR=%ROOT_DIR%\bin"
set "DESKTOP_EXE=%BIN_DIR%\ohg-desktop.exe"
set "SERVER_EXE=%BIN_DIR%\ohg-server.exe"

title 红果短剧 - Windows 桌面客户端
echo ========================================================
echo   红果短剧 (OpenHongguo) - Windows 桌面客户端
echo ========================================================

if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"

:: 1. 检查并编译桌面客户端 (client-windows 模块)
if not exist "%DESKTOP_EXE%" (
    echo 正在首次编译 Rust 桌面客户端 ohg-desktop.exe 至 bin/ 目录...
    cd /d "%ROOT_DIR%\client-windows"
    cargo build --release
    if !errorlevel! neq 0 (
        echo.
        echo [错误] 桌面客户端编译失败，请检查 Rust 开发环境配置。
        pause
        exit /b 1
    )
    copy /y "%ROOT_DIR%\client-windows\target\release\ohg-desktop.exe" "%DESKTOP_EXE%" >nul
)

:: 2. 检查是否传入了自定义远程服务端参数
set "HAS_CUSTOM_SERVER=0"
echo "%*" | findstr /i "\-server" >nul 2>&1
if !errorlevel! equ 0 set "HAS_CUSTOM_SERVER=1"

:: 3. 若使用默认本地服务且未运行，则自动在后台拉起 ohg-server
if !HAS_CUSTOM_SERVER! equ 0 (
    curl -s -m 1 http://127.0.0.1:5210/api/system/status >nul 2>&1
    if !errorlevel! neq 0 (
        if not exist "%SERVER_EXE%" (
            echo 正在首次编译后台服务 ohg-server.exe 至 bin/ 目录...
            cd /d "%ROOT_DIR%"
            go build -ldflags="-s -w" -o "%SERVER_EXE%" ./server/cmd/ohg-server
            if !errorlevel! neq 0 (
                echo [警告] 后台服务端编译失败，桌面端可能无法请求到本地数据。
            )
        )
        if exist "%SERVER_EXE%" (
            echo 正在启动后台服务 [127.0.0.1:5210]...
            start "OpenHongguo Server" /min "%SERVER_EXE%" -open=false
            ping 127.0.0.1 -n 2 >nul
        )
    )
)

echo 正在启动独立窗口客户端...
cd /d "%ROOT_DIR%"
start "" "%DESKTOP_EXE%" %*
exit /b 0
