# OpenClaw Hooks Bundle - 快速开始

## 🚀 5分钟快速安装

### 1. 下载

```bash
# 下载压缩包
wget https://github.com/your-username/openclaw-hooks-bundle/releases/download/v1.0.0/openclaw-hooks-bundle-1.0.0.tar.gz

# 解压
tar -xzf openclaw-hooks-bundle-1.0.0.tar.gz
cd openclaw-hooks-bundle
```

### 2. 安装

```bash
# 一键安装
./install.sh
```

### 3. 验证

```bash
# 检查 Hooks
openclaw hooks list
```

预期输出:
```
Plugin hooks:
- context-mode (3 hooks)
- openclaw-quality-hooks (2 hooks)
```

### 4. 测试

```bash
# 测试 Danger Blocker
rm -rf /tmp/test
# 输出: Blocked dangerous command: `rm -rf` requires `approved: true`.

# 查看审计日志
cd plugins/openclaw-quality-hooks
npm run audit:query -- --type dangerous_command_blocked --limit 5

# 测试 Console.log Audit
echo "console.log('test');" > /tmp/test.js
# 输出: [Hook] ⚠️ Console.log detected in test.js
```

## 📚 详细文档

完整文档请查看 [README.md](README.md)

## 🆘 需要帮助？

- 查看 [README.md](README.md) 的故障排查部分
- 提交 Issue: https://github.com/your-username/openclaw-hooks-bundle/issues

## 🎉 完成！

享受更安全、更高效的开发体验！
