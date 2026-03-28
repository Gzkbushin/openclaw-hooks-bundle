#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_CMD="${OPENCLAW_HOOKS_OPENCLAW_BIN:-openclaw}"
NODE_CMD="${OPENCLAW_HOOKS_NODE_BIN:-node}"
NPM_CMD="${OPENCLAW_HOOKS_NPM_BIN:-npm}"

echo "=== OpenClaw Hooks Bundle v2.0.0 安装程序 ==="

# 检查 OpenClaw
if ! command -v "$OPENCLAW_CMD" &> /dev/null; then
    echo "警告: OpenClaw CLI 未安装，将继续安装插件文件"
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
[ -d "$HOME/.openclaw/extensions/hookify-engine" ] && cp -r "$HOME/.openclaw/extensions/hookify-engine" "$BACKUP_DIR/"
[ -d "$HOME/.openclaw/extensions/context-mode" ] && cp -r "$HOME/.openclaw/extensions/context-mode" "$BACKUP_DIR/"
[ -f "$HOME/.openclaw/openclaw.json" ] && cp "$HOME/.openclaw/openclaw.json" "$BACKUP_DIR/openclaw.json.pre-install"

INSTALL_MODE="fresh install"
if [ -d "$HOME/.openclaw/extensions/openclaw-quality-hooks" ] || [ -d "$HOME/.openclaw/extensions/hookify-engine" ] || [ -d "$HOME/.openclaw/extensions/context-mode" ]; then
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
echo "安装 Hookify Engine..."
install_plugin "$SCRIPT_DIR/plugins/hookify-engine" "$HOME/.openclaw/extensions/hookify-engine"

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

# 安装内置规则到 ~/.openclaw/rules/（仅在目录不存在或为空时复制，不覆盖用户自定义规则）
RULES_SOURCE_DIR="$SCRIPT_DIR/plugins/hookify-engine/src/rules"
RULES_TARGET_DIR="$HOME/.openclaw/rules"
if [ -d "$RULES_SOURCE_DIR" ]; then
    if [ ! -d "$RULES_TARGET_DIR" ] || [ -z "$(ls -A "$RULES_TARGET_DIR" 2>/dev/null)" ]; then
        mkdir -p "$RULES_TARGET_DIR"
        cp -n "$RULES_SOURCE_DIR"/*.md "$RULES_TARGET_DIR/" 2>/dev/null || true
        echo "已安装内置规则到 $RULES_TARGET_DIR"
    else
        echo "规则目录已存在且有内容，跳过内置规则安装（保留用户自定义规则）"
    fi
else
    echo "警告: 内置规则目录不存在 ($RULES_SOURCE_DIR)，跳过规则安装"
fi

# 配置
OPENCLAW_HOOKS_BACKUP_DIR="$BACKUP_DIR" "$NODE_CMD" "$SCRIPT_DIR/scripts/manage-openclaw-config.mjs" install

echo ""
echo "✓ 安装完成！"
echo ""
echo "已安装插件："
echo "  - hookify-engine (声明式规则引擎)"
echo "  - openclaw-quality-hooks (质量与安全钩子)"
echo "  - context-mode (上下文快照与检索)"
echo ""
echo "规则目录: ~/.openclaw/rules/"
echo "运行 'openclaw hooks list' 验证安装"
