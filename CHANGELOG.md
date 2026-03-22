# 📋 v1.1.0 更新日志

## 发布日期
**2026-03-22**

## 🎉 版本概述

v1.1.0 是一个重要的安全和稳定性更新，引入了敏感数据保护、审计日志、配置文件支持和资源管理等核心功能。

---

## 🔒 安全增强

### 敏感数据保护
- **自动检测和过滤**：支持 8 种敏感信息类型
  - API Keys (OpenAI, AWS, GitHub)
  - JWT Tokens
  - 密码和凭证
  - 邮箱地址
  - 手机号码
- **自动集成**：在 Context Mode 快照中自动应用
- **零配置**：开箱即用

### 审计日志
- **危险操作追踪**：自动记录所有被阻止的危险命令
- **JSON 格式**：结构化日志，易于解析
- **日志轮转**：支持按大小和数量自动轮转
- **查询工具**：提供便捷的日志查询脚本

---

## ⚙️ 配置管理

### YAML 配置文件
- **多层级配置**：项目级 > 用户级 > 默认配置
- **配置验证**：自动检测配置错误
- **热加载**：无需重启即可应用配置

### 可配置项
```yaml
qualityHooks:
  enabled: true
  audit:
    enabled: true
    maxBytes: 1048576
    maxFiles: 5

contextMode:
  maxContextSnapshots: 50
  maxMemorySnapshots: 100
  snapshotRetentionDays: 7
```

---

## 📊 资源管理

### 自动清理
- **快照数量限制**：防止磁盘空间无限增长
- **FIFO 策略**：先入先出，自动清理旧快照
- **保留天数**：可配置的数据保留周期

### 资源统计
- 实时监控快照数量
- 自动记录清理操作
- 详细的资源使用日志

---

## 🛡️ 稳定性改进

### 错误处理
- **安全包装**：所有 hooks 使用 `withSafeErrorHandling` 包装
- **错误隔离**：单个 hook 失败不影响系统运行
- **错误日志**：详细的错误信息记录

### 测试覆盖
- **单元测试**：32/32 测试全部通过
- **覆盖率**：整体测试覆盖率 >80%
- **集成测试**：Context Mode 和 Quality Hooks 全面测试

---

## 📦 安装与升级

### 全新安装
```bash
curl -sSL https://raw.githubusercontent.com/Gzkbushin/openclaw-hooks-bundle/main/install.sh | bash
```

### 从 v1.0.0 升级
```bash
cd ~/.openclaw/extensions/openclaw-quality-hooks
git pull origin main
```

### 配置迁移（可选）
1. 复制配置示例：
   ```bash
   cp /path/to/openclaw-hooks.config.yaml.example ~/.openclaw-hooks.config.yaml
   ```

2. 根据需要修改配置

---

## 🔧 技术细节

### 新增文件
```
plugins/openclaw-quality-hooks/
├── hooks/
│   ├── sensitive-data-filter.ts    # 敏感数据过滤器
│   ├── audit-logger.ts             # 审计日志记录器
│   └── config-loader.ts            # 配置加载器
├── scripts/
│   └── query-audit-log.ts          # 审计日志查询工具
└── openclaw-hooks.config.yaml.example

plugins/context-mode/
├── sensitive-data-filter.ts        # Context Mode 敏感数据过滤
├── resource-manager.ts             # 资源管理器
└── test/
    ├── resource-management.test.ts
    └── sensitive-data-filter.test.ts
```

### 代码统计
- **新增文件**：15+
- **代码行数**：2388+ lines
- **测试代码**：1000+ lines
- **Commits**：9 个

---

## 🐛 已修复问题

- 修复 hook 错误导致系统崩溃的问题
- 修复快照无限增长导致磁盘空间不足的问题
- 修复敏感信息泄露到日志的问题

---

## ⚠️ 重要提示

1. **向后兼容**：v1.1.0 完全兼容 v1.0.0
2. **零配置运行**：所有新功能都有合理的默认值
3. **配置可选**：无需配置文件即可使用全部功能
4. **安全优先**：敏感数据过滤默认启用

---

## 🙏 致谢

感谢所有贡献者和用户的反馈！

---

## 📞 支持

- **Issues**: https://github.com/Gzkbushin/openclaw-hooks-bundle/issues
- **Discussions**: https://github.com/Gzkbushin/openclaw-hooks-bundle/discussions

---

**下一版本预告**：v1.2.0 将带来性能监控和更多自定义选项。
