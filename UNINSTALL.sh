#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_CMD="${OPENCLAW_HOOKS_NODE_BIN:-node}"

echo "=== OpenClaw Hooks Bundle 卸载程序 ==="

if ! command -v "$NODE_CMD" &> /dev/null; then
    echo "错误: Node.js 未安装"
    exit 1
fi

# 备份
BACKUP_DIR="$HOME/.openclaw/extensions/backups/uninstall-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

[ -d "$HOME/.openclaw/extensions/openclaw-quality-hooks" ] && cp -r "$HOME/.openclaw/extensions/openclaw-quality-hooks" "$BACKUP_DIR/"
[ -d "$HOME/.openclaw/extensions/context-mode" ] && cp -r "$HOME/.openclaw/extensions/context-mode" "$BACKUP_DIR/"
[ -f "$HOME/.openclaw/openclaw.json" ] && cp "$HOME/.openclaw/openclaw.json" "$BACKUP_DIR/openclaw.json.pre-uninstall"

# 删除
rm -rf "$HOME/.openclaw/extensions/openclaw-quality-hooks"
rm -rf "$HOME/.openclaw/extensions/context-mode"

# 配置
OPENCLAW_HOOKS_BACKUP_DIR="$BACKUP_DIR" "$NODE_CMD" "$SCRIPT_DIR/scripts/manage-openclaw-config.mjs" uninstall

echo "✓ 卸载完成！备份: $BACKUP_DIR"
