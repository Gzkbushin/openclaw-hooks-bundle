#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_CMD="${OPENCLAW_HOOKS_OPENCLAW_BIN:-openclaw}"
NODE_CMD="${OPENCLAW_HOOKS_NODE_BIN:-node}"
NPM_CMD="${OPENCLAW_HOOKS_NPM_BIN:-npm}"

echo "=== OpenClaw Hooks Bundle 安装程序 ==="

# 检查 OpenClaw
if ! command -v "$OPENCLAW_CMD" &> /dev/null; then
    echo "错误: OpenClaw 未安装"
    exit 1
fi

if ! command -v "$NODE_CMD" &> /dev/null; then
    echo "错误: Node.js 未安装"
    exit 1
fi

if ! command -v "$NPM_CMD" &> /dev/null; then
    echo "错误: npm 未安装"
    exit 1
fi

mkdir -p "$HOME/.openclaw" "$HOME/.openclaw/extensions" "$HOME/.openclaw/data/context-mode"

# 备份
BACKUP_DIR="$HOME/.openclaw/extensions/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

[ -d "$HOME/.openclaw/extensions/openclaw-quality-hooks" ] && cp -r "$HOME/.openclaw/extensions/openclaw-quality-hooks" "$BACKUP_DIR/"
[ -d "$HOME/.openclaw/extensions/context-mode" ] && cp -r "$HOME/.openclaw/extensions/context-mode" "$BACKUP_DIR/"
[ -f "$HOME/.openclaw/openclaw.json" ] && cp "$HOME/.openclaw/openclaw.json" "$BACKUP_DIR/openclaw.json.pre-install"

INSTALL_MODE="fresh install"
if [ -d "$HOME/.openclaw/extensions/openclaw-quality-hooks" ] || [ -d "$HOME/.openclaw/extensions/context-mode" ]; then
    INSTALL_MODE="upgrade"
fi
echo "检测到安装模式: $INSTALL_MODE"

install_plugin() {
    local source_dir="$1"
    local target_dir="$2"

    rm -rf "$target_dir"
    cp -R "$source_dir" "$target_dir"
}

# 安装插件
echo "安装 Quality Hooks..."
install_plugin "$SCRIPT_DIR/plugins/openclaw-quality-hooks" "$HOME/.openclaw/extensions/openclaw-quality-hooks"

echo "安装 Context Mode..."
install_plugin "$SCRIPT_DIR/plugins/context-mode" "$HOME/.openclaw/extensions/context-mode"
mkdir -p "$HOME/.openclaw/data/context-mode"

echo "安装 Context Mode 运行时依赖..."
if [ -f "$HOME/.openclaw/extensions/context-mode/package-lock.json" ]; then
    "$NPM_CMD" --prefix "$HOME/.openclaw/extensions/context-mode" ci --omit=dev --no-audit --no-fund
else
    "$NPM_CMD" --prefix "$HOME/.openclaw/extensions/context-mode" install --omit=dev --no-audit --no-fund
fi

# 配置
OPENCLAW_HOOKS_BACKUP_DIR="$BACKUP_DIR" "$NODE_CMD" "$SCRIPT_DIR/scripts/manage-openclaw-config.mjs" install

echo "✓ 安装完成！"
echo "运行 'openclaw hooks list' 验证安装"
