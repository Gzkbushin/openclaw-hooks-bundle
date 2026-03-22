import { existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ensureDir, expandHome } from "./shared.ts";

export type AuditEventType =
  | "dangerous_command_blocked"
  | "dangerous_command_allowed"
  | "git_hook_bypass_blocked"
  | "unsafe_editor_exit_blocked"
  | "config_change";

export type AuditEventAction = "blocked" | "allowed" | "observed";

export type AuditSeverity = "info" | "warn" | "critical";

export type AuditEvent = {
  timestamp: string;
  type: AuditEventType;
  action: AuditEventAction;
  severity: AuditSeverity;
  toolName: string;
  command?: string;
  reason?: string;
  approved?: boolean;
  sessionId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
};

export type AuditLoggerConfig = {
  enabled?: boolean;
  logDir?: string;
  fileName?: string;
  maxBytes?: number;
  maxFiles?: number;
};

export type AuditQuery = {
  type?: AuditEventType | AuditEventType[];
  action?: AuditEventAction;
  limit?: number;
  since?: string;
};

const DEFAULT_FILE_NAME = "audit.log.jsonl";
const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_MAX_FILES = 5;

type ResolvedAuditConfig = {
  enabled: boolean;
  fileName: string;
  logDir: string;
  maxBytes: number;
  maxFiles: number;
};

function resolveAuditConfig(baseLogDir: string, config: AuditLoggerConfig = {}): ResolvedAuditConfig {
  return {
    enabled: config.enabled !== false,
    fileName: config.fileName || DEFAULT_FILE_NAME,
    logDir: expandHome(config.logDir || baseLogDir),
    maxBytes: config.maxBytes && config.maxBytes > 0 ? config.maxBytes : DEFAULT_MAX_BYTES,
    maxFiles: config.maxFiles && config.maxFiles > 0 ? Math.floor(config.maxFiles) : DEFAULT_MAX_FILES
  };
}

function getRotatedAuditPath(filePath: string, index: number): string {
  return `${filePath}.${index}`;
}

function rotateAuditLog(filePath: string, maxFiles: number): void {
  const maxRotatedFiles = Math.max(1, maxFiles) - 1;
  if (maxRotatedFiles <= 0) {
    unlinkSync(filePath);
    return;
  }

  const oldestPath = getRotatedAuditPath(filePath, maxRotatedFiles);
  if (existsSync(oldestPath)) {
    unlinkSync(oldestPath);
  }

  for (let index = maxRotatedFiles - 1; index >= 1; index -= 1) {
    const sourcePath = getRotatedAuditPath(filePath, index);
    const targetPath = getRotatedAuditPath(filePath, index + 1);
    if (existsSync(sourcePath)) {
      renameSync(sourcePath, targetPath);
    }
  }

  renameSync(filePath, getRotatedAuditPath(filePath, 1));
}

function maybeRotateAuditLog(filePath: string, nextLineSize: number, maxBytes: number, maxFiles: number): void {
  if (!existsSync(filePath)) return;
  if (statSync(filePath).size + nextLineSize <= maxBytes) return;
  rotateAuditLog(filePath, maxFiles);
}

function parseAuditLine(line: string): AuditEvent | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as AuditEvent;
  } catch {
    return undefined;
  }
}

function matchesTypeFilter(event: AuditEvent, filter: AuditQuery["type"]): boolean {
  if (!filter) return true;
  if (Array.isArray(filter)) return filter.includes(event.type);
  return event.type === filter;
}

export function getAuditLogPath(baseLogDir: string, config: AuditLoggerConfig = {}): string {
  const resolved = resolveAuditConfig(baseLogDir, config);
  return join(resolved.logDir, resolved.fileName);
}

export function writeAuditEvent(
  baseLogDir: string,
  event: Omit<AuditEvent, "timestamp"> & { timestamp?: string },
  config: AuditLoggerConfig = {}
): AuditEvent | undefined {
  const resolved = resolveAuditConfig(baseLogDir, config);
  if (!resolved.enabled) return undefined;

  ensureDir(resolved.logDir);
  const filePath = join(resolved.logDir, resolved.fileName);
  const record: AuditEvent = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString()
  };
  const line = `${JSON.stringify(record)}\n`;

  maybeRotateAuditLog(filePath, Buffer.byteLength(line), resolved.maxBytes, resolved.maxFiles);
  writeFileSync(filePath, line, { encoding: "utf8", flag: "a" });
  return record;
}

export function queryAuditEvents(baseLogDir: string, query: AuditQuery = {}, config: AuditLoggerConfig = {}): AuditEvent[] {
  const resolved = resolveAuditConfig(baseLogDir, config);
  const files: string[] = [];
  const currentPath = join(resolved.logDir, resolved.fileName);

  if (existsSync(currentPath)) {
    files.push(currentPath);
  }

  for (let index = 1; index < resolved.maxFiles; index += 1) {
    const rotatedPath = getRotatedAuditPath(currentPath, index);
    if (!existsSync(rotatedPath)) break;
    files.push(rotatedPath);
  }

  const since = query.since ? Date.parse(query.since) : Number.NaN;
  const limit = query.limit && query.limit > 0 ? Math.floor(query.limit) : Number.POSITIVE_INFINITY;

  return files
    .flatMap(filePath =>
      readFileSync(filePath, "utf8")
        .split("\n")
        .map(parseAuditLine)
        .filter((event): event is AuditEvent => Boolean(event))
    )
    .filter(event => matchesTypeFilter(event, query.type))
    .filter(event => !query.action || event.action === query.action)
    .filter(event => Number.isNaN(since) || Date.parse(event.timestamp) >= since)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, limit);
}
