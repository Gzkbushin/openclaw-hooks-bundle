import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, delimiter, dirname, extname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

export type Logger = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
};

export type BeforeToolEvent = {
  toolName: string;
  params: Record<string, unknown>;
};

export type BeforeToolResult = {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
};

export type AfterToolEvent = {
  toolName: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs?: number;
};

export type ToolContext = {
  sessionId?: string;
  sessionKey?: string;
  runId?: string;
  toolName?: string;
};

export type ResourceLimitsConfig = {
  maxContextSnapshots?: number;
  maxMemorySnapshots?: number;
  snapshotRetentionDays?: number;
};

export type CommandResolution = {
  bin: string;
  argsPrefix: string[];
};

export function withSafeErrorHandling<T>(
  hookName: string,
  fn: () => T,
  logger?: Logger
): T | undefined {
  try {
    return fn();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.error?.(`[Hook] ${hookName} failed: ${msg}`);
    return undefined;
  }
}

export function normalizeToolName(toolName: string | undefined): string {
  return String(toolName || "").trim().toLowerCase();
}

export function isExecLikeTool(toolName: string | undefined): boolean {
  const normalized = normalizeToolName(toolName);
  return normalized === "exec" || normalized === "bash" || normalized === "exec_command" || normalized === "terminal";
}

export function getCommand(params: Record<string, unknown>): string {
  const value = params.command ?? params.cmd ?? params.argv;
  if (Array.isArray(value)) return value.join(" ");
  return String(value || "");
}

export function getFilePath(params: Record<string, unknown>): string | undefined {
  const raw = params.file_path ?? params.path;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  return resolve(raw);
}

export function expandHome(input: string): string {
  if (!input.startsWith("~")) return input;
  return join(process.env.HOME || "", input.slice(1));
}

export function loadJsonObjectFile(filePath: string, logger?: Logger): Record<string, unknown> {
  if (!existsSync(filePath)) return {};

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      logger?.warn?.(`[Hook] Ignoring config file ${filePath}: expected a JSON object`);
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.warn?.(`[Hook] Failed to read config file ${filePath}: ${msg}`);
    return {};
  }
}

export function resolvePluginConfig(
  inlineConfig: Record<string, unknown> | undefined,
  defaultConfigPath: string,
  logger?: Logger
): Record<string, unknown> {
  const mergedInlineConfig = inlineConfig ? { ...inlineConfig } : {};
  const rawConfigFile = mergedInlineConfig.configFile;
  delete mergedInlineConfig.configFile;

  const configFile = typeof rawConfigFile === "string" && rawConfigFile.trim() !== ""
    ? resolve(dirname(defaultConfigPath), expandHome(rawConfigFile.trim()))
    : defaultConfigPath;
  const fileConfig = loadJsonObjectFile(configFile, logger);
  delete fileConfig.configFile;

  return {
    ...fileConfig,
    ...mergedInlineConfig,
  };
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function appendLog(logDir: string, fileName: string, message: string): void {
  const dir = expandHome(logDir);
  ensureDir(dir);
  const fullPath = join(dir, fileName);
  const line = `[${new Date().toISOString()}] ${message}\n`;
  writeFileSync(fullPath, line, { flag: "a" });
}

export function findUp(startDir: string, candidates: string[]): string | undefined {
  let current = resolve(startDir);
  while (true) {
    for (const candidate of candidates) {
      const fullPath = join(current, candidate);
      if (existsSync(fullPath)) return fullPath;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function findProjectRoot(startDir: string): string {
  const hit = findUp(startDir, [
    "package.json",
    "tsconfig.json",
    "eslint.config.js",
    ".eslintrc",
    ".eslintrc.json",
    ".prettierrc",
    "prettier.config.js",
    "biome.json",
    ".git"
  ]);
  return hit ? dirname(hit) : resolve(startDir);
}

export function resolveCommand(projectRoot: string, names: string[]): CommandResolution | undefined {
  const pathParts = String(process.env.PATH || "").split(delimiter).filter(Boolean);
  const candidateDirs = [join(projectRoot, "node_modules", ".bin"), ...pathParts];
  const exts = process.platform === "win32" ? [".cmd", ".exe", ".bat", ""] : [""];

  for (const name of names) {
    for (const dir of candidateDirs) {
      for (const ext of exts) {
        const fullPath = join(dir, `${name}${ext}`);
        if (existsSync(fullPath)) {
          return { bin: fullPath, argsPrefix: [] };
        }
      }
    }
  }
  return undefined;
}

export function maybeFormatJsonFallback(filePath: string): boolean {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

export function runSync(command: string, args: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    timeout: 30000
  });
  return {
    status: typeof result.status === "number" ? result.status : null,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

export function spawnBackground(
  command: string,
  args: string[],
  cwd: string,
  logger: Logger,
  label: string,
  logDir: string
): void {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", chunk => {
    stdout += String(chunk);
  });
  child.stderr?.on("data", chunk => {
    stderr += String(chunk);
  });
  child.on("error", error => {
    logger.warn?.(`${label} failed to start`, error);
    appendLog(logDir, "quality-gate.log", `${label} failed to start: ${String(error)}`);
  });
  child.on("close", code => {
    if (code && code !== 0) {
      const summary = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").trim();
      logger.warn?.(`${label} reported issues${summary ? `\n${summary}` : ""}`);
      appendLog(logDir, "quality-gate.log", `${label} exited with code ${code}${summary ? `\n${summary}` : ""}`);
      return;
    }
    appendLog(logDir, "quality-gate.log", `${label} passed`);
  });
}

export function hasJsonExtension(filePath: string): boolean {
  return extname(filePath).toLowerCase() === ".json";
}

export function shortPath(filePath: string): string {
  return basename(filePath);
}
