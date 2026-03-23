# v1.1.0

发布日期：`2026-03-22`

## 概览

`v1.1.0` 聚焦安全、配置和上下文管理能力，并补齐了测试与运行时保护。

## 主要变更

### openclaw-quality-hooks

- 新增危险命令拦截与审计日志记录
- 新增智能提醒、自动格式化和后台质量检查模块
- 新增分层配置加载与基础 schema 校验
- 所有 hook 通过安全包装隔离错误，避免单点失败影响整体运行

### context-mode

- 新增工具调用事件持久化
- 新增会话快照构建与恢复
- 新增 FTS5 + BM25 检索辅助压缩
- 新增敏感信息脱敏与资源清理策略

## 配置

当前支持的顶级配置如下：

```yaml
qualityHooks:
  enabled: true
  logDir: ~/.openclaw/logs/openclaw-quality-hooks
  audit:
    enabled: true
    fileName: audit.log.jsonl
    maxBytes: 1048576
    maxFiles: 5

contextMode:
  enabled: true
  dbPath: ~/.context-mode/db
  maxContextSnapshots: 50
  maxMemorySnapshots: 100
  snapshotRetentionDays: 7
```

## 安装与升级

全新安装或从旧版本升级，均建议重新执行安装脚本：

```bash
git clone https://github.com/Gzkbushin/openclaw-hooks-bundle.git
cd openclaw-hooks-bundle
./install.sh
```

如果是在源码仓库内做本地开发，请先安装 `context-mode` 的本地依赖：

```bash
npm --prefix plugins/context-mode install
```

## 安装链路

- 安装脚本现在显式使用 `npm ci --omit=dev` 安装 `context-mode` 运行时依赖
- 安装和卸载都会备份已有插件与 `openclaw.json`
- 遇到损坏的 `openclaw.json` 时会自动备份并恢复
- 新增安装生命周期和发布布局 smoke test

## 验证

当前仓库使用以下命令做基础验证：

```bash
npm test
npm run lint
npm run coverage
```

## 支持

- Issues：https://github.com/Gzkbushin/openclaw-hooks-bundle/issues
- Discussions：https://github.com/Gzkbushin/openclaw-hooks-bundle/discussions
