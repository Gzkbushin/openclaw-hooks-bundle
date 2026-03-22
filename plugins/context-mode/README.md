# Context Mode OpenClaw Plugin

OpenClaw 原生插件版本的 context-mode，实现：

- `after_tool_call` 会话事件采集（SQLite）
- `before_compaction` 2KB 内快照构建
- `session_start` 快照恢复注入
- FTS5 + BM25 检索（用于快照相关片段提取）
- P1-P4 优先级分层与智能摘要提取

## 文件

- `openclaw.plugin.json`：插件清单
- `index.ts`：插件运行时
- `test/smoke.mjs`：基础验证脚本

## 配置

```json
{
  "enabled": true,
  "dbPath": "~/.context-mode/db"
}
```

`dbPath` 可传目录或 `.db` 文件路径。

## 数据库结构

- `session_meta`
- `session_events`
- `session_events_fts` (FTS5)
- `session_resume`

## 测试

```bash
cd /tmp/context-mode-openclaw
node test/smoke.mjs
```
