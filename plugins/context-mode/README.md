# Context Mode OpenClaw Plugin

OpenClaw 原生插件版本的 context-mode，实现：

- `after_tool_call` 会话事件采集（SQLite）
- `before_compaction` 2KB 内快照构建
- `session_start` 快照恢复注入
- FTS5 + BM25 检索（用于快照相关片段提取）
- P1-P4 优先级分层与智能摘要提取
- 敏感信息脱敏（邮箱、手机号、密码、token、API key）

## 文件

- `openclaw.plugin.json`：插件清单
- `index.ts`：插件运行时
- `test/smoke.mjs`：基础验证脚本

## 配置

```json
{
  "enabled": true,
  "configFile": "~/.openclaw/extensions/context-mode/openclaw.config.json",
  "dbPath": "~/.context-mode/db",
  "maxContextSnapshots": 50,
  "maxMemorySnapshots": 100,
  "snapshotRetentionDays": 7
}
```

默认会读取插件目录下的 `openclaw.config.json`。如需把配置放到别处，可通过 `configFile` 指向自定义 JSON 文件。

`dbPath` 可传目录或 `.db` 文件路径。

- `maxContextSnapshots`：最多保留多少条 `session_resume` 快照，超出后按 FIFO 删除最旧快照
- `maxMemorySnapshots`：最多保留多少条 `session_events` 记忆快照，超出后按 FIFO 删除最旧事件
- `snapshotRetentionDays`：快照和记忆事件的保留天数，过期数据会自动清理

每次工具调用和压缩前都会记录资源统计日志，并在需要时自动清理超限或过期数据。

## 隐私保护

`context-mode` 在写入 SQLite、生成快照、恢复上下文前会统一做敏感信息过滤，默认脱敏以下内容：

- email 地址
- 电话号码
- `password` / `passwd` / `pwd`
- `token` / `accessToken` / `refreshToken`
- `apiKey` / `clientSecret` / `secretKey`
- 常见 JWT、GitHub token、OpenAI key、AWS access key

脱敏后会以 `[REDACTED:<type>]` 占位，避免敏感原文进入持久化上下文。

## 数据库结构

- `session_meta`
- `session_events`
- `session_events_fts` (FTS5)
- `session_resume`

## 测试

```bash
cd plugins/context-mode
npm test
npm run lint
```
