#!/bin/bash
set -e

echo "=== OpenClaw Hooks Bundle 卸载程序 ==="

# 备份
BACKUP_DIR="$HOME/.openclaw/extensions/backups/uninstall-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

[ -d "$HOME/.openclaw/extensions/openclaw-quality-hooks" ] && cp -r "$HOME/.openclaw/extensions/openclaw-quality-hooks" "$BACKUP_DIR/"
[ -d "$HOME/.openclaw/extensions/context-mode" ] && cp -r "$HOME/.openclaw/extensions/context-mode" "$BACKUP_DIR/"

# 删除
rm -rf "$HOME/.openclaw/extensions/openclaw-quality-hooks"
rm -rf "$HOME/.openclaw/extensions/context-mode"

# 配置
node -e "
const fs = require('fs');
const path = require('path');
const configPath = path.join(process.env.HOME, '.openclaw/openclaw.json');
if (!fs.existsSync(configPath)) process.exit(0);
let config = JSON.parse(fs.readFileSync(configPath));
if (config.plugins?.allow) {
  config.plugins.allow = config.plugins.allow.filter(p => 
    p !== 'openclaw-quality-hooks' && p !== 'context-mode'
  );
}
if (config.plugins?.load?.paths) {
  const paths = [
    path.join(process.env.HOME, '.openclaw/extensions/openclaw-quality-hooks'),
    path.join(process.env.HOME, '.openclaw/extensions/context-mode')
  ];
  config.plugins.load.paths = config.plugins.load.paths.filter(p => !paths.includes(p));
}
if (config.plugins?.entries) {
  delete config.plugins.entries['openclaw-quality-hooks'];
  delete config.plugins.entries['context-mode'];
}
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
"

echo "✓ 卸载完成！备份: $BACKUP_DIR"
