# ==============================================================================
# OpenHongguo - 上游 SDK 编译包/工具链主动集成脚本 (PowerShell)
# 作用: 自动拉取/编译上游 beilunyang/openhongguo 最新发布的 SDK 命令行工具并集成至 bin/
# ==============================================================================

param (
    [string]$Version = "v0.3.0",
    [switch]$ForceRebuild = $false
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$BinDir = Join-Path $RootDir "bin"
$TargetExe = Join-Path $BinDir "ohg.exe"

if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  OpenHongguo - 主动集成上游 SDK 编译包 (版本: $Version)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if ((Test-Path $TargetExe) -and (-not $ForceRebuild)) {
    Write-Host "[OK] 上游 SDK 编译包已存在: $TargetExe" -ForegroundColor Green
    & $TargetExe --help | Select-Object -First 3
    exit 0
}

Write-Host "正在从上游 SDK 模块 (github.com/beilunyang/openhongguo@$Version) 编译集成 CLI 工具..." -ForegroundColor Yellow

try {
    Push-Location $RootDir
    go build -trimpath -ldflags="-s -w" -o $TargetExe "github.com/beilunyang/openhongguo/cmd/ohg"
    Pop-Location

    if (Test-Path $TargetExe) {
        Write-Host "[成功] 上游 SDK 编译包成功集成至: $TargetExe" -ForegroundColor Green
        & $TargetExe --help | Select-Object -First 3
    } else {
        throw "编译输出未找到 $TargetExe"
    }
} catch {
    Write-Host "[错误] 集成上游 SDK 失败: $_" -ForegroundColor Red
    exit 1
}
