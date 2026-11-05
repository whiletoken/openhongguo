@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: 确定项目根目录与产物路径
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%..\..\"
set "ROOT_DIR=%CD%\"
popd

set "BIN_DIR=%ROOT_DIR%bin"
set "TARGET_EXE=%BIN_DIR%\ohg-desktop.exe"

title 红果短剧 - Windows 桌面客户端
echo ========================================================
echo   红果短剧 (OpenHongguo) - Windows 桌面客户端
echo ========================================================
echo 正在启动独立窗口客户端...

if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"

if not exist "%TARGET_EXE%" (
    echo 正在首次编译 ohg-desktop.exe 至 bin/ 目录...
    cd /d "%ROOT_DIR%"
    go build -ldflags="-s -w" -o "%TARGET_EXE%" ./cmd/ohg-desktop
    if !errorlevel! neq 0 (
        echo.
        echo [错误] 编译失败，请检查 Go 开发环境配置与网络依赖。
        pause
        exit /b 1
    )
)

start "" "%TARGET_EXE%"
exit /b 0
