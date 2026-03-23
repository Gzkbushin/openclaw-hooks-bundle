import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";

const action = process.argv[2];

if (!action || !["install", "uninstall"].includes(action)) {
  console.error("Usage: node scripts/manage-openclaw-config.mjs <install|uninstall>");
  process.exit(1);
}

const homeDir = process.env.HOME;
if (!homeDir) {
  console.error("HOME is required");
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const openclawDir = join(homeDir, ".openclaw");
const extensionsDir = join(openclawDir, "extensions");
const configPath = join(openclawDir, "openclaw.json");
const backupDir = process.env.OPENCLAW_HOOKS_BACKUP_DIR || join(extensionsDir, "backups", `config-${timestamp}`);

const PLUGINS = [
  {
    id: "openclaw-quality-hooks",
    path: join(extensionsDir, "openclaw-quality-hooks"),
    configFile: join(extensionsDir, "openclaw-quality-hooks", "openclaw.config.json"),
  },
  {
    id: "context-mode",
    path: join(extensionsDir, "context-mode"),
    configFile: join(extensionsDir, "context-mode", "openclaw.config.json"),
  },
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function backupExistingConfig(reason) {
  if (!existsSync(configPath)) return;
  ensureDir(backupDir);
  const extension = extname(configPath) || ".json";
  const fileName = `openclaw.${reason}.${timestamp}${extension}`;
  const targetPath = join(backupDir, fileName);
  copyFileSync(configPath, targetPath);
  console.log(`Backed up ${configPath} -> ${targetPath}`);
}

function loadConfig() {
  ensureDir(dirname(configPath));
  if (!existsSync(configPath)) return {};

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    if (!isPlainObject(parsed)) {
      backupExistingConfig("invalid");
      return {};
    }
    return parsed;
  } catch (error) {
    backupExistingConfig("invalid");
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Recovered from invalid OpenClaw config: ${message}`);
    return {};
  }
}

function ensureObject(target, key) {
  const current = target[key];
  if (isPlainObject(current)) return current;
  const next = {};
  target[key] = next;
  return next;
}

function ensureArray(target, key) {
  const current = target[key];
  if (Array.isArray(current)) return current;
  const next = [];
  target[key] = next;
  return next;
}

function writeConfig(config) {
  ensureDir(dirname(configPath));
  const tempPath = `${configPath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  renameSync(tempPath, configPath);
}

function installConfig() {
  const config = loadConfig();
  backupExistingConfig("install");

  const plugins = ensureObject(config, "plugins");
  const allow = ensureArray(plugins, "allow");
  const load = ensureObject(plugins, "load");
  const paths = ensureArray(load, "paths");
  const entries = ensureObject(plugins, "entries");

  for (const plugin of PLUGINS) {
    if (!allow.includes(plugin.id)) {
      allow.push(plugin.id);
    }
    if (!paths.includes(plugin.path)) {
      paths.push(plugin.path);
    }
    entries[plugin.id] = {
      enabled: true,
      config: {
        configFile: plugin.configFile,
      },
    };
  }

  writeConfig(config);
}

function uninstallConfig() {
  const config = loadConfig();
  if (!existsSync(configPath) && Object.keys(config).length === 0) {
    return;
  }

  backupExistingConfig("uninstall");

  const plugins = ensureObject(config, "plugins");
  const allow = ensureArray(plugins, "allow");
  const load = ensureObject(plugins, "load");
  const paths = ensureArray(load, "paths");
  const entries = ensureObject(plugins, "entries");

  plugins.allow = allow.filter(entry => !PLUGINS.some(plugin => plugin.id === entry));
  load.paths = paths.filter(entry => !PLUGINS.some(plugin => plugin.path === entry));

  for (const plugin of PLUGINS) {
    delete entries[plugin.id];
  }

  writeConfig(config);
}

if (action === "install") {
  installConfig();
} else {
  uninstallConfig();
}
