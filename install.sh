#!/bin/bash
set -e

echo "=== OpenClaw Hooks Bundle 安装程序 ==="

# 检查 OpenClaw
if ! command -v openclaw &> /dev/null; then
    echo "错误: OpenClaw 未安装"
    exit 1
fi

# 备份
BACKUP_DIR="$HOME/.openclaw/extensions/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

[ -d "$HOME/.openclaw/extensions/openclaw-quality-hooks" ] && cp -r "$HOME/.openclaw/extensions/openclaw-quality-hooks" "$BACKUP_DIR/"
[ -d "$HOME/.openclaw/extensions/context-mode" ] && cp -r "$HOME/.openclaw/extensions/context-mode" "$BACKUP_DIR/"

# 安装插件
echo "安装 Quality Hooks..."
cp -r plugins/openclaw-quality-hooks "$HOME/.openclaw/extensions/"

echo "安装 Context Mode..."
cp -r plugins/context-mode "$HOME/.openclaw/extensions/"
mkdir -p "$HOME/.openclaw/data/context-mode"

# 配置
node -e "
const fs = require('fs');
const path = require('path');
const configPath = path.join(process.env.HOME, '.openclaw/openclaw.json');
let config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath)) : {};

if (!config.plugins) config.plugins = {};
if (!config.plugins.allow) config.plugins.allow = [];
if (!config.plugins.load) config.plugins.load = {paths: []};
if (!config.plugins.entries) config.plugins.entries = {};

['openclaw-quality-hooks', 'context-mode'].forEach(p => {
  if (!config.plugins.allow.includes(p)) config.plugins.allow.push(p);
});

const paths = [
  path.join(process.env.HOME, '.openclaw/extensions/openclaw-quality-hooks'),
  path.join(process.env.HOME, '.openclaw/extensions/context-mode')
];
paths.forEach(p => {
  if (!config.plugins.load.paths.includes(p)) config.plugins.load.paths.push(p);
});

config.plugins.entries['openclaw-quality-hooks'] = {enabled: true, config: {
  configFile: path.join(process.env.HOME, '.openclaw/extensions/openclaw-quality-hooks', 'openclaw.config.json')
}};
config.plugins.entries['context-mode'] = {enabled: true, config: {
  configFile: path.join(process.env.HOME, '.openclaw/extensions/context-mode', 'openclaw.config.json')
}};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
"

echo "✓ 安装完成！"
echo "运行 'openclaw hooks list' 验证安装"
