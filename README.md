# OpenClaw Hooks Bundle

高质量的 OpenClaw 插件集合，聚焦代码安全、审计、上下文快照与开发体验。

[![License: Mixed](https://img.shields.io/badge/license-mixed-lightgrey.svg)](#许可证)
[![GitHub Stars](https://img.shields.io/github/stars/Gzkbushin/openclaw-hooks-bundle?style=social)](https://github.com/Gzkbushin/openclaw-hooks-bundle)
[![Version](https://img.shields.io/badge/version-v1.1.0-blue.svg)](CHANGELOG.md)

## 概述

当前 bundle 包含两个插件：

- `openclaw-quality-hooks`
  负责 `before_tool_call` / `after_tool_call` 两个 OpenClaw 生命周期钩子，并在内部组合危险命令阻断、审计日志、提醒、格式化和质量检查模块。
- `context-mode`
  负责 `session_start` / `after_tool_call` / `before_compaction` 三个生命周期钩子，提供 SQLite 持久化、上下文快照恢复、FTS5 检索和敏感信息脱敏。

当前版本：`v1.1.0`

## 功能

### openclaw-quality-hooks

- 阻断危险命令，例如未显式批准的 `rm -rf`
- 记录审计事件，支持 JSONL 和日志轮转
- 提醒长耗时命令和 `git push` 前检查
- 在可用时调用 `biome` / `prettier` / `ruff` 做自动格式化
- 在可用时调用 `tsc` / `eslint` 做后台质量检查

### context-mode

- 记录工具调用事件到 SQLite
- 在压缩前构建会话快照，并在下次会话开始时恢复
- 使用 FTS5 + BM25 做相关片段检索
- 对邮箱、手机号、token、API key 等信息统一脱敏
- 按数量和保留天数自动清理快照与事件

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

`install.sh` 会：

- 备份已有插件目录
- 复制两个插件到 `~/.openclaw/extensions/`
- 为 `context-mode` 使用 `package-lock.json` 显式执行 `npm ci --omit=dev`
- 更新 `~/.openclaw/openclaw.json` 中的插件配置
- 遇到损坏或无效的 `openclaw.json` 时自动备份并恢复为可写状态

### 环境要求

- OpenClaw CLI
- Node.js `22+`
- npm `10+`

## 配置

### 配置优先级

从低到高依次为：

1. 插件自带默认配置
2. 用户级配置 `~/.openclaw-hooks.config.yaml`
3. 项目级配置 `openclaw-hooks.config.yaml`
4. `configFile` 显式指定的配置文件
5. OpenClaw 运行时传入的内联配置

### 配置示例

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

### 已支持的配置项

`qualityHooks`

- `enabled`
- `configFile`
- `logDir`
- `audit.enabled`
- `audit.logDir`
- `audit.fileName`
- `audit.maxBytes`
- `audit.maxFiles`

`contextMode`

- `enabled`
- `configFile`
- `dbPath`
- `maxContextSnapshots`
- `maxMemorySnapshots`
- `snapshotRetentionDays`

## 使用

### 验证安装

```bash
openclaw hooks list
```

预期至少能看到：

- `openclaw-quality-hooks`
- `context-mode`

### 查询审计日志

```bash
npm --prefix ~/.openclaw/extensions/openclaw-quality-hooks run audit:query -- --limit 20
```

### 查看日志文件

```bash
cat ~/.openclaw/logs/openclaw-quality-hooks/audit.log.jsonl
```

## 开发

### 首次准备

从干净 checkout 开始时，先安装 `context-mode` 的本地依赖：

```bash
npm --prefix plugins/context-mode install
```

### 常用命令

```bash
npm test
npm run lint
npm run coverage
npm run smoke
npm run check
```

### 项目结构

```text
openclaw-hooks-bundle/
├── plugins/
│   ├── openclaw-quality-hooks/
│   │   ├── hooks/
│   │   ├── scripts/
│   │   ├── test/
│   │   ├── index.ts
│   │   ├── openclaw.config.json
│   │   └── openclaw.plugin.json
│   └── context-mode/
│       ├── test/
│       ├── index.ts
│       ├── sensitive-data-filter.ts
│       ├── openclaw.config.json
│       └── openclaw.plugin.json
├── install.sh
├── UNINSTALL.sh
├── openclaw-hooks.config.yaml.example
├── CHANGELOG.md
└── README.md
```

## 测试

- `npm test`：运行两个插件的测试和 `context-mode` smoke test
- `npm run lint`：运行语法级 lint / 加载检查
- `npm run coverage`：运行覆盖率检查，当前阈值为 `lines/functions/branches >= 80%`
- `npm run smoke`：运行安装/卸载流程和发布布局 smoke test

## 变更日志

最新版本说明见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

这个仓库不是单一许可证仓库：

- 仓库级脚本、文档以及 `plugins/openclaw-quality-hooks` 采用 MIT
- `plugins/context-mode` 保留 `Elastic License 2.0` 元数据

详细说明见 [LICENSE](LICENSE) 以及各插件目录下的 `package.json` / `openclaw.plugin.json`。

## 支持

- 仓库主页：https://github.com/Gzkbushin/openclaw-hooks-bundle
- Issues：https://github.com/Gzkbushin/openclaw-hooks-bundle/issues
- Discussions：https://github.com/Gzkbushin/openclaw-hooks-bundle/discussions
