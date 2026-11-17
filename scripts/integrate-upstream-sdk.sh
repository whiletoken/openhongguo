#!/usr/bin/env bash
# ==============================================================================
# OpenHongguo - 上游 SDK 编译包/工具链主动集成脚本 (Bash)
# 作用: 自动拉取/编译上游 beilunyang/openhongguo 最新发布的 SDK 命令行工具并集成至 bin/
# ==============================================================================

set -euo pipefail

VERSION="${1:-v0.3.0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BIN_DIR="${ROOT_DIR}/bin"
TARGET_EXE="${BIN_DIR}/ohg"

mkdir -p "${BIN_DIR}"

echo "=========================================================="
echo "  OpenHongguo - 主动集成上游 SDK 编译包 (版本: ${VERSION})"
echo "=========================================================="

if [ -f "${TARGET_EXE}" ] && [ "${2:-}" != "--force" ]; then
    echo "[OK] 上游 SDK 编译包已存在: ${TARGET_EXE}"
    "${TARGET_EXE}" --help | head -n 3 || true
    exit 0
fi

echo "正在从上游 SDK 模块 (github.com/beilunyang/openhongguo@${VERSION}) 编译集成 CLI 工具..."
cd "${ROOT_DIR}"
go build -trimpath -ldflags="-s -w" -o "${TARGET_EXE}" "github.com/beilunyang/openhongguo/cmd/ohg"

if [ -f "${TARGET_EXE}" ]; then
    chmod +x "${TARGET_EXE}"
    echo "[成功] 上游 SDK 编译包成功集成至: ${TARGET_EXE}"
    "${TARGET_EXE}" --help | head -n 3 || true
else
    echo "[错误] 编译输出未找到 ${TARGET_EXE}" >&2
    exit 1
fi
