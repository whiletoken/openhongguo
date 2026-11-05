@echo off
chcp 65001 >nul
title 红果短剧 - Windows 桌面客户端
echo ========================================================
echo   红果短剧 (OpenHongguo) - Windows 桌面客户端
echo ========================================================
echo 正在启动独立窗口客户端...

if not exist "%~dp0ohg-desktop.exe" (
    echo 正在首次编译 ohg-desktop.exe...
    go build -o "%~dp0ohg-desktop.exe" ./cmd/ohg-desktop
)

start "" "%~dp0ohg-desktop.exe"
exit
