@echo off
chcp 65001 >nul
title 红果短剧 - Windows 桌面客户端
echo ========================================================
echo   红果短剧 (OpenHongguo) - Windows 桌面应用模式
echo ========================================================
echo 正在启动独立窗口客户端...

if not exist "%~dp0ohg-web.exe" (
    echo 正在首次编译 ohg-web.exe...
    go build -o "%~dp0ohg-web.exe" ./cmd/ohg-web
)

start "" "%~dp0ohg-web.exe" -desktop
exit
