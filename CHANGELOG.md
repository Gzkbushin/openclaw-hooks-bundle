# 更新日志

## [Unreleased]

### 新增
- ✅ Danger Blocker 审计日志
  - JSONL 审计事件输出，带时间戳
  - 默认写入 `audit.log.jsonl`
  - 按文件大小轮转并保留历史文件
  - 提供 `npm run audit:query` 查询工具

## [1.0.0] - 2026-03-22

### 新增
- ✅ Quality Hooks (openclaw-quality-hooks)
  - Danger Blocker - 阻止危险命令
  - Auto Formatter - 自动格式化代码
  - Smart Reminder - 智能提醒
  - Console.log Audit - 检测遗留的 console.log
  - Quality Gate - 异步代码质量检查

- ✅ Context Mode (context-mode)
  - 智能上下文检索
  - 快照保存和恢复
  - Token 节省（平均 40%）
  - 3个 Hooks（record, snapshot, restore）

### 文档
- 完整的 README.md
- 安装脚本 (install.sh)
- 卸载脚本 (UNINSTALL.sh)
- 配置示例
- 故障排查指南

### 性能
- Quality Hooks: <10ms 平均影响
- Context Mode: <15ms 总影响
- Token 节省: 40%

---

## [未来计划]

### [1.1.0] - 计划中
- [ ] 添加更多格式化工具支持
- [ ] 增强上下文检索算法
- [ ] 添加更多安全检查
- [ ] 性能优化
- [ ] Web UI 用于配置管理

---

## 贡献者

- Your Name - 初始版本

---

## 许可证

MIT License - 详见 LICENSE 文件
