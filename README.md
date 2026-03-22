# OpenClaw Hooks Bundle

<div align="center">

**🚀 High-quality OpenClaw Hooks for code quality, security, and developer experience**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/Gzkbushin/openclaw-hooks-bundle?style=social)](https://github.com/Gzkbushin/openclaw-hooks-bundle)
[![Test Coverage](https://img.shields.io/badge/coverage-80%25+-brightgreen)](README.md#testing)

</div>

---

## 📖 目录

- [概述](#概述)
- [功能特性](#功能特性)
- [包含的插件](#包含的插件)
- [安装](#安装)
- [配置](#配置)
- [使用指南](#使用指南)
- [开发](#开发)
- [测试](#测试)
- [变更日志](#变更日志)
- [许可证](#许可证)
- [支持](#支持)

---

## 概述

OpenClaw Hooks Bundle 是一套高质量的 OpenClaw Hooks，旨在提升代码质量、安全性和开发体验。本项目包含两个核心插件：

- **openclaw-quality-hooks**: 代码质量检查和安全增强
- **context-mode**: 智能上下文管理和记忆功能

### 核心特性

✨ **开箱即用** - 无需配置，合理默认值
🔒 **安全优先** - 敏感数据自动过滤
🛡️ **稳定可靠** - 错误隔离，系统不崩溃
⚙️ **高度可配置** - YAML 配置文件支持
📊 **资源管理** - 自动清理，防止磁盘膨胀
🧪 **测试覆盖** - 80%+ 测试覆盖率

---

## 功能特性

### 🔒 安全增强

| 功能 | 描述 |
|------|------|
| **敏感数据保护** | 自动检测并过滤 API keys、密码、token、邮箱、手机号等 8 种敏感信息 |
| **审计日志** | 记录所有危险操作，JSON 格式，支持日志轮转 |
| **危险命令阻止** | 拦截 rm -rf 等危险命令，保护系统安全 |

### ⚙️ 代码质量

| 功能 | 描述 |
|------|------|
| **Console Log 审计** | 检测代码中的 console.log，防止调试代码残留 |
| **自动格式化** | 自动格式化代码，保持代码风格一致 |
| **质量门禁** | 检查代码质量指标，确保代码标准 |

### 🧠 智能管理

| 功能 | 描述 |
|------|------|
| **上下文快照** | 自动保存和恢复会话上下文 |
| **记忆增强** | 智能记忆重要信息，跨会话持久化 |
| **资源限制** | 自动清理旧快照，可配置保留策略 |
| **智能提醒** | 根据上下文提供智能提醒和建议 |

---

## 包含的插件

### 1. openclaw-quality-hooks

代码质量检查和安全增强工具集。

**Hooks（8个）**：
- `danger-blocker` - 危险命令阻止
- `console-log-audit` - Console log 审计
- `auto-formatter` - 自动代码格式化
- `quality-gate` - 质量门禁检查
- `smart-reminder` - 智能提醒
- `sensitive-data-filter` - 敏感数据过滤
- `audit-logger` - 审计日志记录
- `config-loader` - 配置加载器

### 2. context-mode

智能上下文管理和记忆功能。

**功能**：
- 上下文快照和恢复
- 敏感数据自动过滤
- 资源管理和自动清理
- 跨会话记忆持久化

---

## 安装

### 方法 1: 快速安装（推荐）

```bash
curl -sSL https://raw.githubusercontent.com/Gzkbushin/openclaw-hooks-bundle/main/install.sh | bash
```

### 方法 2: 手动安装

```bash
# 1. 克隆仓库
git clone https://github.com/Gzkbushin/openclaw-hooks-bundle.git
cd openclaw-hooks-bundle

# 2. 安装依赖
npm install

# 3. 构建项目
npm run build

# 4. 复制到 OpenClaw extensions 目录
cp -r plugins/* ~/.openclaw/extensions/
```

### 方法 3: 从 GitHub Release 安装

```bash
# 下载最新 Release
wget https://github.com/Gzkbushin/openclaw-hooks-bundle/releases/latest/download/openclaw-hooks-bundle.tar.gz

# 解压并安装
tar -xzf openclaw-hooks-bundle.tar.gz
cd openclaw-hooks-bundle
./install.sh
```

---

## 配置

### 配置文件位置

配置文件按优先级从高到低：

1. **项目级配置**：`<project>/.openclaw-hooks.config.yaml`
2. **用户级配置**：`~/.openclaw-hooks.config.yaml`
3. **默认配置**：内置默认值

### 配置示例

创建 `~/.openclaw-hooks.config.yaml`：

```yaml
# Quality Hooks 配置
qualityHooks:
  enabled: true
  logDir: ~/.openclaw/logs/openclaw-quality-hooks

  # 审计日志配置
  audit:
    enabled: true
    fileName: audit.log.jsonl
    maxBytes: 1048576      # 1MB
    maxFiles: 5            # 保留 5 个日志文件

  # 危险命令配置
  dangerBlocker:
    enabled: true
    blockUnapproved: true

  # 质量门禁配置
  qualityGate:
    enabled: true
    intervalSeconds: 30

# Context Mode 配置
contextMode:
  enabled: true
  dbPath: ~/.context-mode/db

  # 资源限制
  maxContextSnapshots: 50       # 最大上下文快照数
  maxMemorySnapshots: 100       # 最大内存快照数
  snapshotRetentionDays: 7      # 快照保留天数

  # 自动清理
  autoCleanup: true
  cleanupIntervalHours: 24
```

### 配置项说明

#### qualityHooks.*

| 配置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `enabled` | boolean | true | 是否启用 Quality Hooks |
| `logDir` | string | ~/.openclaw/logs/... | 日志目录 |
| `audit.enabled` | boolean | true | 是否启用审计日志 |
| `audit.maxBytes` | number | 1048576 | 单个日志文件最大字节数 |
| `audit.maxFiles` | number | 5 | 保留的日志文件数量 |

#### contextMode.*

| 配置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `enabled` | boolean | true | 是否启用 Context Mode |
| `dbPath` | string | ~/.context-mode/db | 数据库路径 |
| `maxContextSnapshots` | number | 50 | 最大上下文快照数 |
| `maxMemorySnapshots` | number | 100 | 最大内存快照数 |
| `snapshotRetentionDays` | number | 7 | 快照保留天数 |

---

## 使用指南

### 快速开始

安装完成后，hooks 会自动生效。无需额外配置！

### 查看审计日志

```bash
# 使用查询工具
node ~/.openclaw/extensions/openclaw-quality-hooks/scripts/query-audit-log.ts

# 或直接查看日志文件
cat ~/.openclaw/logs/openclaw-hooks-quality/audit.log.jsonl | jq
```

### 验证安装

```bash
# 检查 hooks 是否加载
openclaw hooks list

# 查看日志
ls -la ~/.openclaw/logs/
```

### 常见问题

<details>
<summary><b>Q: 如何禁用某个 hook？</b></summary>

在配置文件中设置：
```yaml
qualityHooks:
  dangerBlocker:
    enabled: false
```
</details>

<details>
<summary><b>Q: 如何调整资源限制？</b></summary>

修改配置文件：
```yaml
contextMode:
  maxContextSnapshots: 100  # 增加到 100
  snapshotRetentionDays: 14 # 保留 14 天
```
</details>

<details>
<summary><b>Q: 如何查看敏感数据过滤效果？</b></summary>

敏感数据会在日志和快照中自动被替换为 `[REDACTED:type]` 标签。
</details>

---

## 开发

### 环境要求

- Node.js >= 18
- npm >= 9
- OpenClaw CLI

### 开发流程

```bash
# 1. 克隆仓库
git clone https://github.com/Gzkbushin/openclaw-hooks-bundle.git
cd openclaw-hooks-bundle

# 2. 安装依赖
npm install

# 3. 开发模式（自动监听文件变化）
npm run dev

# 4. 运行测试
npm test

# 5. 构建
npm run build

# 6. 本地测试
npm run link
```

### 项目结构

```
openclaw-hooks-bundle/
├── plugins/
│   ├── openclaw-quality-hooks/    # Quality Hooks 插件
│   │   ├── hooks/                  # Hooks 实现
│   │   ├── test/                   # 测试文件
│   │   └── scripts/                # 工具脚本
│   └── context-mode/               # Context Mode 插件
│       ├── hooks/                  # Hooks 实现
│       └── test/                   # 测试文件
├── install.sh                      # 安装脚本
├── CHANGELOG.md                    # 变更日志
└── README.md                       # 本文件
```

---

## 测试

### 运行所有测试

```bash
npm test
```

### 运行特定测试

```bash
# Quality Hooks 测试
npm test -- plugins/openclaw-quality-hooks

# Context Mode 测试
npm test -- plugins/context-mode
```

### 测试覆盖率

```bash
npm run test:coverage
```

当前测试覆盖率：**80%+**

---

## 变更日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解详细的版本更新记录。

### 最新版本 (v1.1.0)

- 🔒 敏感数据保护（8种类型）
- 📝 审计日志系统
- ⚙️ YAML 配置文件支持
- 📊 资源管理和自动清理
- 🛡️ 错误处理增强
- 🧪 测试覆盖率提升到 80%+

---

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

## 支持

### 获取帮助

- 📖 [文档](https://github.com/Gzkbushin/openclaw-hooks-bundle/wiki)
- 🐛 [报告问题](https://github.com/Gzkbushin/openclaw-hooks-bundle/issues)
- 💬 [讨论区](https://github.com/Gzkbushin/openclaw-hooks-bundle/discussions)

### 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

---

<div align="center">

**如果这个项目对你有帮助，请给个 ⭐️ Star！**

Made with ❤️ by the OpenClaw community

</div>
