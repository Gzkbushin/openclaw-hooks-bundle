# OpenClaw Hooks Bundle - 快速开始

## 1. 获取项目

```bash
git clone https://github.com/Gzkbushin/openclaw-hooks-bundle.git
cd openclaw-hooks-bundle
```

也可以从 Release 下载最新打包产物后解压，再进入目录执行下面的安装命令。

## 2. 安装

```bash
./install.sh
```

安装脚本会自动复制插件并为 `context-mode` 安装运行时依赖。
如果已存在旧版本安装，脚本会先备份已有插件和 `openclaw.json`，再执行升级。

## 3. 验证

```bash
openclaw hooks list
```

预期至少能看到：

- `context-mode`
- `openclaw-quality-hooks`

## 4. 查看审计日志

```bash
npm --prefix ~/.openclaw/extensions/openclaw-quality-hooks run audit:query -- --limit 5
```

## 5. 更多说明

- 完整文档见 [README.md](README.md)
- 问题反馈见 https://github.com/Gzkbushin/openclaw-hooks-bundle/issues
