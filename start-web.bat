@echo off
chcp 65001 >nul
title 红果短剧 - Web 服务与浏览器播放器
echo ========================================================
echo   红果短剧 (OpenHongguo) - Web 页面模式
echo ========================================================
echo 正在启动 Web 服务并打开浏览器...

if not exist "%~dp0ohg-web.exe" (
    echo 正在首次编译 ohg-web.exe...
    go build -o "%~dp0ohg-web.exe" ./cmd/ohg-web
)

"%~dp0ohg-web.exe"
pause
