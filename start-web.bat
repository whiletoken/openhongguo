@echo off
chcp 65001 >nul
title 红果短剧 - Web 服务与浏览器播放器
echo ========================================================
echo   红果短剧 (OpenHongguo) - 服务端 + Web 端模式
echo ========================================================
echo 正在启动后台服务并打开浏览器...

if not exist "%~dp0ohg-server.exe" (
    echo 正在首次编译 ohg-server.exe...
    go build -o "%~dp0ohg-server.exe" ./cmd/ohg-server
)

"%~dp0ohg-server.exe" -open=true
pause
