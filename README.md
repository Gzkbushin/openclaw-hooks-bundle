# OpenClaw Hooks Bundle v1.0.0

[![License: Mixed](https://img.shields.io/badge/license-mixed-lightgrey.svg)](#许可证)
[![GitHub Stars](https://img.shields.io/github/stars/Gzkbushin/openclaw-hooks-bundle?style=social)](https://github.com/Gzkbushin/openclaw-hooks-bundle)
[![Version](https://img.shields.io/badge/version-v1.0.0-blue.svg)](CHANGELOG.md)
[![Plugins](https://img.shields.io/badge/plugins-3-green.svg)](#概述)

高质量的 OpenClaw 插件集合，含声明式规则引擎、代码安全审计、上下文快照与开发体验增强。

---

## 概述 Overview

OpenClaw Hooks Bundle v1.0.0 包含三个插件：

| 插件 | 功能 | 生命周期钩子 |
|------|------|-------------|
| **hookify-engine** | 声明式 Markdown 规则引擎 | `before_tool_call`, `after_tool_call` |
| **openclaw-quality-hooks** | 安全阻断、审计、提醒、格式化、质量检查 | `before_tool_call`, `after_tool_call` |
| **context-mode** | SQLite 持久化、上下文快照、FTS5 检索、敏感信息脱敏 | `session_start`, `after_tool_call`, `before_compaction` |

### v1.0.0 核心变化

- ✅ 新增 **hookify-engine** — 用 Markdown + YAML frontmatter 声明规则，无需写代码
- 🔄 **openclaw-quality-hooks** 现在委托 hookify-engine 进行规则评估
- 🛡️ 内置 11 条默认规则，覆盖危险命令、调试代码、敏感文件等场景
- 📁 规则热加载 — 修改规则文件即刻生效，无需重启
- 🔄 向后兼容 — hookify-engine 不可用时自动回退到内置钩子

---

## 插件详情

### 1. hookify-engine — 声明式规则引擎

#### 它是什么

hookify-engine 是一个零依赖的声明式规则引擎，允许你用 Markdown 文件定义 OpenClaw 钩子规则，无需编写任何 TypeScript 代码。

每个规则是一个 `.md` 文件，包含 YAML frontmatter（定义规则元数据和条件）以及 Markdown 正文（作为提示信息展示给用户）。

#### 规则文件格式

```markdown
---
name: block-dangerous-rm
enabled: true
event: before_tool_call
priority: 900
severity: error
action: block
conditions:
  - field: tool_name
    operator: regex_match
    pattern: exec|bash|terminal
  - field: command
    operator: regex_match
    pattern: \brm\s+-[^\n]*[rf][^\n]*\b
---

🛑 **Dangerous rm command detected!**

This command could delete important files.
Operation blocked unless `approved: true` is provided.
```

#### 可用字段 (field)

| 字段 | 说明 | 适用事件 |
|------|------|---------|
| `tool_name` | 工具名称（如 exec, edit, write） | before/after_tool_call |
| `command` | 命令内容（exec/bash 的命令参数） | before_tool_call |
| `file_path` | 文件路径 | before/after_tool_call |
| `new_text` | 写入的新内容 | after_tool_call |
| `old_text` | 被替换的旧内容 | after_tool_call |
| `content` | 文件完整内容 | after_tool_call |
| `user_prompt` | 用户提示词 | before_tool_call |
| `session_id` | 当前会话 ID | all |

#### 可用运算符 (operator)

| 运算符 | 说明 | 示例 |
|--------|------|------|
| `regex_match` | 正则匹配 | `pattern: \brm\s+-rf\b` |
| `not_regex_match` | 正则不匹配 | `pattern: test_` |
| `contains` | 包含子串 | `pattern: password` |
| `not_contains` | 不包含子串 | `pattern: approved` |
| `equals` | 完全相等 | `pattern: delete` |
| `starts_with` | 以...开头 | `pattern: rm -` |
| `ends_with` | 以...结尾 | `pattern: .env` |
| `glob_match` | Glob 模式匹配 | `pattern: **/*.env` |

#### 可用动作 (action)

| 动作 | 说明 |
|------|------|
| `block` | 阻止操作执行（仅 before_tool_call） |
| `warn` | 发出警告但允许继续 |
| `log` | 记录日志但不提示用户 |
| `allow` | 显式允许（覆盖低优先级规则） |

#### 严重级别 (severity)

| 级别 | 说明 |
|------|------|
| `error` | 严重错误，通常配合 block 使用 |
| `warning` | 警告，通常配合 warn 使用 |
| `info` | 信息级别，通常配合 log 使用 |

#### 优先级 (priority)

- 范围：`0` - `1000`
- 数值越高优先级越高
- 同优先级按规则名称排序
- 建议分级：
  - `900-1000`：安全阻断（危险命令）
  - `500-899`：重要警告（敏感文件、凭证泄露）
  - `100-499`：代码质量提醒（调试代码、格式化）
  - `0-99`：信息记录

#### 内置规则

| 规则文件 | 事件 | 动作 | 优先级 | 说明 |
|----------|------|------|--------|------|
| `block-dangerous-rm.md` | before | block | 900 | 阻断 rm -rf 等危险删除 |
| `block-git-hook-bypass.md` | before | block | 900 | 阻断 --no-verify 绕过 |
| `block-unsafe-editor-exit.md` | before | block | 800 | 阻断 :q! 丢弃更改 |
| `block-destructive-ops.md` | before | block | 850 | 阻断格式化、分区等破坏性操作 |
| `warn-sensitive-files.md` | before | warn | 700 | 警告编辑 .env、密钥等敏感文件 |
| `warn-typed-credentials.md` | before | warn | 600 | 警告 TypeScript 中硬编码凭证 |
| `warn-hardcoded-secrets.md` | after | warn | 600 | 警告写入硬编码密钥/token |
| `warn-no-gitignore.md` | after | warn | 180 | 警告创建敏感文件但未加入 .gitignore |
| `warn-debug-code.md` | after | warn | 100 | 警告 console.log / debugger |
| `remind-long-commands.md` | before | warn | 50 | 提醒可能长时间运行的命令 |
| `check-git-push.md` | before | warn | 100 | git push 前检查提醒 |

#### 热加载

hookify-engine 使用基于文件修改时间（mtime）的 lazy 缓存策略：
- 每次触发 hook 时，自动检测规则文件是否有变更
- 新增 `.md` 文件 → 下次触发时自动加载
- 修改已有文件 → 下次触发时重新解析并替换
- 删除文件 → 下次触发时自动移除
- **无需重启 OpenClaw**，规则保存后即刻生效

#### 配置选项

```yaml
hookifyEngine:
  enabled: true
  rulesDir: ~/.openclaw/rules
  maxRegexCacheSize: 256
```

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用规则引擎 |
| `rulesDir` | string | `~/.openclaw/rules` | 规则文件目录 |
| `maxRegexCacheSize` | integer | `256` | LRU 正则缓存条目数 |

---

### 2. openclaw-quality-hooks — 质量与安全钩子

v1.0.0 中，openclaw-quality-hooks 已与 hookify-engine 集成：

- **规则评估** 委托给 hookify-engine（danger-blocker、console-log-audit 的逻辑已转化为声明式规则）
- **工具驱动功能** 保持不变：auto-formatter、quality-gate、smart-reminder
- **向后兼容**：hookify-engine 不可用时，自动回退到内置钩子

#### 功能列表

| 功能 | 驱动方式 | 说明 |
|------|----------|------|
| 危险命令阻断 | hookify-engine 规则 | rm -rf, --no-verify, :q! 等 |
| 调试代码检测 | hookify-engine 规则 | console.log, debugger 等 |
| 智能提醒 | 内置钩子 | 长耗时命令、git push 前检查 |
| 自动格式化 | 内置钩子 | biome / prettier / ruff |
| 质量检查 | 内置钩子 | tsc / eslint 后台检查 |
| 审计日志 | 内置钩子 | JSONL 格式，支持轮转 |

#### 配置

```yaml
qualityHooks:
  enabled: true
  logDir: ~/.openclaw/logs/openclaw-quality-hooks
  audit:
    enabled: true
    fileName: audit.log.jsonl
    maxBytes: 1048576
    maxFiles: 5
```

---

### 3. context-mode — 上下文快照与检索

context-mode 提供持久化上下文管理（v1.0.0 无变化）。

#### 功能

- 🗄️ 记录工具调用事件到 SQLite
- 📸 压缩前构建会话快照，下次会话自动恢复
- 🔍 FTS5 + BM25 语义检索相关片段
- 🕵️ 邮箱、手机号、token、API key 统一脱敏
- 🧹 按数量和保留天数自动清理

#### 配置

```yaml
contextMode:
  enabled: true
  dbPath: ~/.context-mode/db
  maxContextSnapshots: 50
  maxMemorySnapshots: 100
  snapshotRetentionDays: 7
```

---

## 安装

### 快速安装

```bash
curl -sSL https://raw.githubusercontent.com/Gzkbushin/openclaw-hooks-bundle/main/install.sh | bash
```

### 从源码安装

```bash
git clone https://github.com/Gzkbushin/openclaw-hooks-bundle.git
cd openclaw-hooks-bundle
./install.sh
```

### 安装过程

`install.sh` 会自动完成：

1. **备份** 已有插件目录和 `openclaw.json`
2. **安装** 三个插件到 `~/.openclaw/extensions/`：
   - hookify-engine
   - openclaw-quality-hooks
   - context-mode
3. **安装内置规则** 到 `~/.openclaw/rules/`（仅首次，不覆盖用户自定义规则）
4. **安装依赖**（context-mode 的 npm 运行时依赖）
5. **更新配置** `~/.openclaw/openclaw.json` 中的插件注册

### 环境要求

- OpenClaw CLI
- Node.js `22+`
- npm `10+`

---

## 快速开始

### 1. 安装 Bundle

```bash
./install.sh
```

### 2. 验证安装

```bash
openclaw hooks list
```

预期输出包含：
- `hookify-engine`
- `openclaw-quality-hooks`
- `context-mode`

### 3. 查看内置规则

```bash
ls ~/.openclaw/rules/
```

### 4. 创建自定义规则

创建 `~/.openclaw/rules/my-rule.md`：

```markdown
---
name: warn-large-files
enabled: true
event: before_tool_call
priority: 200
severity: warning
action: warn
conditions:
  - field: file_path
    operator: ends_with
    pattern: .zip
  - field: tool_name
    operator: regex_match
    pattern: edit|write
---

📦 **Large file detected**

Be cautious when editing binary/archive files.
```

规则文件保存后即刻生效，无需重启。

### 5. 禁用内置规则

编辑对应的 `.md` 文件，将 `enabled` 改为 `false`：

```yaml
---
name: block-dangerous-rm
enabled: false    # ← 改为 false
...
---
```

---

## 配置

### 配置优先级

从低到高：

1. 插件自带默认配置 (`openclaw.config.json`)
2. 用户级配置 `~/.openclaw-hooks.config.yaml`
3. 项目级配置 `./openclaw-hooks.config.yaml`
4. `configFile` 显式指定的配置文件
5. OpenClaw 运行时内联配置

### 完整配置示例

```yaml
hookifyEngine:
  enabled: true
  rulesDir: ~/.openclaw/rules
  maxRegexCacheSize: 256

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

---

## 目录结构

```text
openclaw-hooks-bundle/
├── plugins/
│   ├── hookify-engine/              # 声明式规则引擎 (NEW in v1.0.0)
│   │   ├── src/
│   │   │   ├── types.ts             # 类型定义
│   │   │   ├── rule-loader.ts       # Markdown 规则加载器
│   │   │   ├── rule-engine.ts       # 条件评估引擎
│   │   │   ├── event-mapper.ts      # 事件映射
│   │   │   ├── hooks/
│   │   │   │   ├── before-tool-call.ts
│   │   │   │   └── after-tool-call.ts
│   │   │   └── rules/               # 内置默认规则
│   │   │       ├── block-dangerous-rm.md
│   │   │       ├── block-git-hook-bypass.md
│   │   │       ├── block-unsafe-editor-exit.md
│   │   │       ├── block-destructive-ops.md
│   │   │       ├── warn-sensitive-files.md
│   │   │       ├── warn-typed-credentials.md
│   │   │       ├── warn-hardcoded-secrets.md
│   │   │       ├── warn-debug-code.md
│   │   │       ├── remind-long-commands.md
│   │   │       └── check-git-push.md
│   │   ├── test/
│   │   ├── index.ts
│   │   ├── openclaw.plugin.json
│   │   ├── openclaw.config.json
│   │   └── package.json
│   ├── openclaw-quality-hooks/      # 质量与安全钩子
│   │   ├── hooks/
│   │   │   ├── auto-formatter.ts
│   │   │   ├── quality-gate.ts
│   │   │   ├── smart-reminder.ts
│   │   │   ├── audit-logger.ts
│   │   │   ├── config-loader.ts
│   │   │   ├── shared.ts
│   │   │   ├── danger-blocker.ts    # DEPRECATED (fallback)
│   │   │   └── console-log-audit.ts # DEPRECATED (fallback)
│   │   ├── scripts/
│   │   ├── test/
│   │   ├── index.ts
│   │   ├── openclaw.config.json
│   │   └── openclaw.plugin.json
│   └── context-mode/                # 上下文快照与检索
│       ├── test/
│       ├── index.ts
│       ├── sensitive-data-filter.ts
│       ├── openclaw.config.json
│       └── openclaw.plugin.json
├── scripts/
│   └── manage-openclaw-config.mjs
├── test/
│   ├── release-layout.test.mjs
│   └── install-lifecycle-smoke.sh
├── install.sh
├── UNINSTALL.sh
├── openclaw-hooks.config.yaml.example
├── CHANGELOG.md
├── README.md
├── LICENSE
└── package.json
```

运行时文件结构：

```text
~/.openclaw/
├── openclaw.json                    # OpenClaw 主配置
├── extensions/
│   ├── hookify-engine/
│   ├── openclaw-quality-hooks/
│   └── context-mode/
├── rules/                           # 用户自定义 + 内置规则
│   ├── block-dangerous-rm.md
│   ├── warn-debug-code.md
│   └── my-custom-rule.md            # 你的自定义规则
├── data/
│   └── context-mode/
└── logs/
    └── openclaw-quality-hooks/
```

---

## 测试

```bash
npm test           # 运行所有插件测试 + smoke test
npm run lint       # 语法检查
npm run coverage   # 覆盖率检查 (≥80%)
npm run smoke      # 安装/卸载生命周期 + 发布布局 smoke test
npm run check      # 覆盖率 + lint + smoke 全量检查
```

### 审计日志查询

```bash
npm --prefix ~/.openclaw/extensions/openclaw-quality-hooks run audit:query -- --limit 20
```

### 查看日志

```bash
cat ~/.openclaw/logs/openclaw-quality-hooks/audit.log.jsonl
```

---

## 卸载

```bash
./UNINSTALL.sh
```

卸载会：
- 备份所有插件和配置
- 移除三个插件目录
- 从 `openclaw.json` 中移除插件注册
- **不会删除** `~/.openclaw/rules/` 中的用户自定义规则

---

## 变更日志

最新版本说明见 [CHANGELOG.md](CHANGELOG.md)。

---

## 致谢

hookify-engine 的设计灵感来源于 [Anthropic Claude Code 官方 hookify 插件](https://github.com/anthropics/claude-code/tree/main/plugins/hookify)。Claude Code 的 hookify 插件首创了「用 Markdown + YAML frontmatter 声明式定义 AI 编程助手 Hook 规则」的范式，包括规则文件格式、条件运算符、动作类型（warn/block）等核心概念。本项目在此设计基础上进行了重新实现并适配 OpenClaw 插件体系，新增了规则热加载、FTS5 检索、优先级队列、资源管理等能力。

感谢 [Anthropic](https://github.com/anthropics) 开源 Claude Code 生态。

---

## 许可证

这个仓库不是单一许可证仓库：

- 仓库级脚本、文档、`plugins/hookify-engine` 和 `plugins/openclaw-quality-hooks` 采用 MIT
- `plugins/context-mode` 保留 `Elastic License 2.0` 元数据

详细说明见 [LICENSE](LICENSE) 以及各插件目录下的 `package.json` / `openclaw.plugin.json`。

---

## 支持

- 仓库主页：https://github.com/Gzkbushin/openclaw-hooks-bundle
- Issues：https://github.com/Gzkbushin/openclaw-hooks-bundle/issues
- Discussions：https://github.com/Gzkbushin/openclaw-hooks-bundle/discussions
