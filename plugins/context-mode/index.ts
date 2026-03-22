import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { redactSensitiveData } from "./sensitive-data-filter.ts";

type AnyRecord = Record<string, unknown>;

type Logger = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
};

type PluginApi = {
  on: (event: string, handler: (payload?: unknown) => unknown, opts?: { priority?: number }) => void;
  logger?: Logger;
};

type SessionStartEvent = {
  sessionId?: string;
  session_id?: string;
  id?: string;
};

type ToolCallEvent = {
  sessionId?: string;
  session_id?: string;
  toolName?: string;
  tool_name?: string;
  name?: string;
  params?: AnyRecord;
  input?: AnyRecord;
  toolInput?: AnyRecord;
  arguments?: AnyRecord;
  result?: unknown;
  output?: unknown;
  toolResponse?: unknown;
  error?: string | boolean;
  isError?: boolean;
  durationMs?: number;
};

type ResumeRow = {
  snapshot: string;
  event_count: number;
  consumed: number;
};

type EventRow = {
  id: number;
  session_id: string;
  tool_name: string;
  priority: number;
  summary: string;
  detail: string;
  is_error: number;
  created_at: string;
};

type SearchRow = {
  tool_name: string;
  priority: number;
  summary: string;
  score: number;
};

type DB = {
  pragma: (stmt: string) => unknown;
  exec: (sql: string) => unknown;
  prepare: (sql: string) => {
    run: (...args: unknown[]) => unknown;
    get: (...args: unknown[]) => unknown;
    all: (...args: unknown[]) => unknown[];
  };
};

const TOOL_PRIORITIES: Record<string, number> = {
  ctx_execute: 1,
  ctx_execute_file: 1,
  ctx_batch_execute: 1,
  ctx_index: 2,
  ctx_search: 2,
  ctx_fetch_and_index: 2,
  write: 1,
  edit: 1,
  apply_patch: 1,
  bash: 2,
  exec: 2,
  read: 2,
  grep: 3,
  glob: 3,
  webfetch: 3,
};

const SANDBOX_TOOLS = new Set([
  "ctx_execute",
  "ctx_batch_execute",
  "ctx_execute_file",
  "ctx_index",
  "ctx_search",
  "ctx_fetch_and_index",
]);

function normalizeToolName(raw: string): string {
  return raw.trim().toLowerCase();
}

function expandHomePath(input: string): string {
  if (!input.startsWith("~")) return input;
  return join(homedir(), input.slice(1));
}

function toJson(value: unknown): string {
  const sanitized = redactSensitiveData(value);
  if (sanitized == null) return "";
  if (typeof sanitized === "string") return sanitized;
  try {
    return JSON.stringify(sanitized);
  } catch {
    return String(sanitized);
  }
}

function compactText(value: string, maxWords: number): string {
  const cleaned = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  const words = cleaned.split(" ");
  if (words.length <= maxWords) return cleaned;

  return words.slice(0, maxWords).join(" ");
}

function pickParamsSummary(params: AnyRecord): string {
  const priorityKeys = [
    "command",
    "cmd",
    "file_path",
    "path",
    "query",
    "queries",
    "url",
    "language",
    "cwd",
    "pattern",
  ];

  const parts: string[] = [];
  for (const key of priorityKeys) {
    const value = params[key];
    if (value == null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      parts.push(`${key}=${compactText(toJson(value.slice(0, 3)), 24)}`);
      continue;
    }
    parts.push(`${key}=${compactText(toJson(value), 24)}`);
  }

  if (parts.length === 0) {
    const keys = Object.keys(params);
    if (keys.length === 0) return "";
    return `keys=${keys.slice(0, 6).join(",")}`;
  }

  return parts.join("; ");
}

function pickResultSummary(result: unknown): string {
  const text = toJson(result);
  if (!text) return "";

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const important = lines.filter((line) => /error|fail|exception|denied|timeout/i.test(line));
  if (important.length > 0) {
    return compactText(important[0], 28);
  }

  return compactText(lines[0] ?? "", 28);
}

function detectError(e: ToolCallEvent): boolean {
  if (e.isError === true) return true;
  if (typeof e.error === "boolean") return e.error;
  if (typeof e.error === "string" && e.error.length > 0) return true;

  const text = toJson(e.result ?? e.output ?? e.toolResponse);
  return /error|fail|exception|denied|timeout/i.test(text);
}

function classifyPriority(toolName: string, isError: boolean): number {
  if (isError) return 1;

  const base = TOOL_PRIORITIES[toolName];
  if (base) return base;

  if (/ctx_/.test(toolName)) return 2;
  if (/read|grep|glob|search/.test(toolName)) return 3;
  return 4;
}

function resolveSessionId(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const e = payload as SessionStartEvent;
  return e.sessionId || e.session_id || e.id || fallback;
}

function makeEventSummary(toolName: string, params: AnyRecord, result: unknown, isError: boolean): { summary: string; detail: string } {
  const safeParams = redactSensitiveData(params) as AnyRecord;
  const safeResult = redactSensitiveData(result);
  const paramSummary = pickParamsSummary(safeParams);
  const resultSummary = pickResultSummary(safeResult);

  const summaryParts = [
    toolName,
    paramSummary,
    resultSummary ? `result=${resultSummary}` : "",
    isError ? "status=error" : "status=ok",
  ].filter(Boolean);

  const detail = JSON.stringify(
    {
      tool: toolName,
      params: safeParams,
      result: compactText(toJson(safeResult), 220),
      isError,
    },
    null,
    0,
  );

  return {
    summary: compactText(summaryParts.join(" | "), 56),
    detail,
  };
}

class ContextModeDB {
  private db: DB;
  private ensureSessionStmt;
  private touchSessionStmt;
  private insertEventStmt;
  private recentEventsStmt;
  private upsertResumeStmt;
  private getResumeStmt;
  private consumeResumeStmt;
  private countStmt;
  private searchStmt;

  constructor(dbPath: string) {
    const require = createRequire(import.meta.url);
    const BetterSqlite3 = require("better-sqlite3") as new (path: string, opts?: AnyRecord) => DB;
    this.db = new BetterSqlite3(dbPath, { timeout: 5000 });

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_meta (
        session_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_event_at TEXT,
        event_count INTEGER NOT NULL DEFAULT 0,
        compact_count INTEGER NOT NULL DEFAULT 0,
        last_snapshot_at TEXT
      );

      CREATE TABLE IF NOT EXISTS session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        priority INTEGER NOT NULL,
        summary TEXT NOT NULL,
        detail TEXT NOT NULL,
        is_error INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_session_events_sid ON session_events(session_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_session_events_pri ON session_events(session_id, priority, id DESC);

      CREATE VIRTUAL TABLE IF NOT EXISTS session_events_fts USING fts5(
        session_id UNINDEXED,
        summary,
        detail,
        tokenize='porter unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS session_events_ai AFTER INSERT ON session_events BEGIN
        INSERT INTO session_events_fts(rowid, session_id, summary, detail)
        VALUES (new.id, new.session_id, new.summary, new.detail);
      END;

      CREATE TRIGGER IF NOT EXISTS session_events_ad AFTER DELETE ON session_events BEGIN
        INSERT INTO session_events_fts(session_events_fts, rowid, session_id, summary, detail)
        VALUES ('delete', old.id, old.session_id, old.summary, old.detail);
      END;

      CREATE TRIGGER IF NOT EXISTS session_events_au AFTER UPDATE ON session_events BEGIN
        INSERT INTO session_events_fts(session_events_fts, rowid, session_id, summary, detail)
        VALUES ('delete', old.id, old.session_id, old.summary, old.detail);
        INSERT INTO session_events_fts(rowid, session_id, summary, detail)
        VALUES (new.id, new.session_id, new.summary, new.detail);
      END;

      CREATE TABLE IF NOT EXISTS session_resume (
        session_id TEXT PRIMARY KEY,
        snapshot TEXT NOT NULL,
        event_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        consumed INTEGER NOT NULL DEFAULT 0
      );
    `);

    this.ensureSessionStmt = this.db.prepare(
      `INSERT OR IGNORE INTO session_meta (session_id) VALUES (?)`,
    );

    this.touchSessionStmt = this.db.prepare(`
      UPDATE session_meta
      SET last_event_at = datetime('now'), event_count = event_count + 1
      WHERE session_id = ?
    `);

    this.insertEventStmt = this.db.prepare(`
      INSERT INTO session_events (session_id, tool_name, priority, summary, detail, is_error)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.recentEventsStmt = this.db.prepare(`
      SELECT id, session_id, tool_name, priority, summary, detail, is_error, created_at
      FROM session_events
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT ?
    `);

    this.countStmt = this.db.prepare(`SELECT COUNT(*) AS c FROM session_events WHERE session_id = ?`);

    this.upsertResumeStmt = this.db.prepare(`
      INSERT INTO session_resume (session_id, snapshot, event_count, consumed)
      VALUES (?, ?, ?, 0)
      ON CONFLICT(session_id) DO UPDATE SET
        snapshot = excluded.snapshot,
        event_count = excluded.event_count,
        created_at = datetime('now'),
        consumed = 0
    `);

    this.getResumeStmt = this.db.prepare(
      `SELECT snapshot, event_count, consumed FROM session_resume WHERE session_id = ?`,
    );

    this.consumeResumeStmt = this.db.prepare(
      `UPDATE session_resume SET consumed = 1 WHERE session_id = ?`,
    );

    this.searchStmt = this.db.prepare(`
      SELECT
        se.tool_name AS tool_name,
        se.priority AS priority,
        se.summary AS summary,
        bm25(session_events_fts, 2.0, 1.0) AS score
      FROM session_events_fts
      JOIN session_events se ON se.id = session_events_fts.rowid
      WHERE session_events_fts MATCH ? AND session_events_fts.session_id = ?
      ORDER BY score
      LIMIT ?
    `);
  }

  ensureSession(sessionId: string): void {
    this.ensureSessionStmt.run(sessionId);
  }

  insertToolEvent(sessionId: string, toolName: string, priority: number, summary: string, detail: string, isError: boolean): void {
    this.ensureSession(sessionId);
    this.insertEventStmt.run(sessionId, toolName, priority, summary, detail, isError ? 1 : 0);
    this.touchSessionStmt.run(sessionId);
  }

  getRecentEvents(sessionId: string, limit = 120): EventRow[] {
    return this.recentEventsStmt.all(sessionId, limit) as EventRow[];
  }

  getEventCount(sessionId: string): number {
    const row = this.countStmt.get(sessionId) as { c: number } | undefined;
    return row?.c ?? 0;
  }

  upsertResume(sessionId: string, snapshot: string): void {
    const eventCount = this.getEventCount(sessionId);
    this.upsertResumeStmt.run(sessionId, snapshot, eventCount);
  }

  getResume(sessionId: string): ResumeRow | null {
    return (this.getResumeStmt.get(sessionId) as ResumeRow | undefined) ?? null;
  }

  markResumeConsumed(sessionId: string): void {
    this.consumeResumeStmt.run(sessionId);
  }

  searchSession(sessionId: string, query: string, limit = 6): SearchRow[] {
    const safeQuery = query
      .replace(/["'(){}\[\]*:^~]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => `"${word}"`)
      .join(" ");

    if (!safeQuery.trim()) return [];
    return this.searchStmt.all(safeQuery, sessionId, limit) as SearchRow[];
  }
}

function buildSnapshot(eventsDesc: EventRow[], searchRows: SearchRow[], maxBytes = 2048): string {
  const events = [...eventsDesc].reverse();

  const payload: {
    v: number;
    generatedAt: string;
    totalEvents: number;
    p1: Array<{ tool: string; summary: string }>;
    p2: Array<{ tool: string; summary: string }>;
    p3: Array<{ tool: string; summary: string }>;
    p4: Array<{ tool: string; summary: string }>;
    related: Array<{ tool: string; hit: string; score: number }>;
  } = {
    v: 1,
    generatedAt: new Date().toISOString(),
    totalEvents: events.length,
    p1: [],
    p2: [],
    p3: [],
    p4: [],
    related: searchRows.slice(0, 4).map((row) => ({
      tool: row.tool_name,
      hit: compactText(row.summary, 16),
      score: Number(row.score.toFixed(3)),
    })),
  };

  for (const row of events) {
    const item = { tool: row.tool_name, summary: compactText(row.summary, 18) };
    if (row.priority <= 1 && payload.p1.length < 8) {
      payload.p1.push(item);
      continue;
    }
    if (row.priority === 2 && payload.p2.length < 8) {
      payload.p2.push(item);
      continue;
    }
    if (row.priority === 3 && payload.p3.length < 6) {
      payload.p3.push(item);
      continue;
    }
    if (payload.p4.length < 4) {
      payload.p4.push(item);
    }
  }

  const serialize = () => JSON.stringify(payload);
  let snapshot = serialize();

  while (Buffer.byteLength(snapshot, "utf8") > maxBytes) {
    if (payload.p4.length > 0) {
      payload.p4.pop();
    } else if (payload.p3.length > 0) {
      payload.p3.pop();
    } else if (payload.related.length > 0) {
      payload.related.pop();
    } else if (payload.p2.length > 1) {
      payload.p2.pop();
    } else if (payload.p1.length > 2) {
      payload.p1.pop();
    } else {
      break;
    }
    snapshot = serialize();
  }

  return snapshot;
}

function deriveSearchQueryFromRecent(events: EventRow[]): string {
  const recent = events.slice(0, 24);
  const tokenSet = new Set<string>();

  for (const event of recent) {
    const text = `${event.tool_name} ${event.summary}`.toLowerCase();
    for (const token of text.split(/[^a-z0-9_./-]+/)) {
      if (token.length < 4) continue;
      if (/^(with|from|that|this|result|status|true|false|json)$/.test(token)) continue;
      tokenSet.add(token);
      if (tokenSet.size >= 8) break;
    }
    if (tokenSet.size >= 8) break;
  }

  return Array.from(tokenSet).join(" ");
}

function isLikelyExecutionTool(toolName: string): boolean {
  return /bash|exec|shell|python|node|write|edit|apply_patch/.test(toolName);
}

const configSchema = {
  type: "object",
  properties: {
    enabled: { type: "boolean", default: true },
    dbPath: { type: "string", default: "~/.context-mode/db" },
  },
} as const;

export default {
  id: "context-mode",
  name: "Context Mode",
  version: "1.0.0",
  description: "Privacy-first context optimization for OpenClaw",
  configSchema,

  register(api: PluginApi): void {
    const log: Logger = {
      info: (...args: unknown[]) => api.logger?.info?.("[context-mode]", ...args),
      warn: (...args: unknown[]) => api.logger?.warn?.("[context-mode]", ...args),
      error: (...args: unknown[]) => api.logger?.error?.("[context-mode]", ...args),
      debug: (...args: unknown[]) => api.logger?.debug?.("[context-mode]", ...args),
    };

    const config = (globalThis as { OPENCLAW_PLUGIN_CONFIG?: AnyRecord }).OPENCLAW_PLUGIN_CONFIG || {};
    const enabled = config.enabled !== false;
    if (!enabled) {
      log.info?.("plugin disabled by config");
      return;
    }

    const basePath = expandHomePath(String(config.dbPath || "~/.context-mode/db"));
    const dbFile = basePath.endsWith(".db") ? basePath : join(basePath, "context-mode-openclaw.db");

    mkdirSync(dirname(resolve(dbFile)), { recursive: true });

    let db: ContextModeDB;
    try {
      db = new ContextModeDB(resolve(dbFile));
    } catch (error) {
      log.error?.("failed to initialize database (is better-sqlite3 installed?)", error);
      return;
    }

    let currentSessionId = randomUUID();
    db.ensureSession(currentSessionId);

    api.on("session_start", (payload?: unknown) => {
      const sessionId = resolveSessionId(payload, currentSessionId);
      currentSessionId = sessionId;
      db.ensureSession(sessionId);

      const resume = db.getResume(sessionId);
      if (!resume || resume.consumed === 1) {
        return undefined;
      }

      db.markResumeConsumed(sessionId);

      const injected = [
        "<context_mode_resume>",
        resume.snapshot,
        "</context_mode_resume>",
      ].join("\n");

      log.debug?.("session restored", { sessionId, eventCount: resume.event_count });

      return {
        prependSystemContext: injected,
        contextModeResume: resume.snapshot,
      };
    });

    api.on("after_tool_call", (payload?: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const event = payload as ToolCallEvent;

      const toolName = normalizeToolName(String(event.toolName || event.tool_name || event.name || "unknown"));
      const params = (event.params || event.input || event.toolInput || event.arguments || {}) as AnyRecord;
      const result = event.result ?? event.output ?? event.toolResponse;

      const isError = detectError(event);
      const priority = classifyPriority(toolName, isError);
      const sid = resolveSessionId(event, currentSessionId);
      const { summary, detail } = makeEventSummary(toolName, params, result, isError);

      db.insertToolEvent(sid, toolName, priority, summary, detail, isError);

      if (!SANDBOX_TOOLS.has(toolName) && isLikelyExecutionTool(toolName)) {
        const routeSummary = `routing_violation | tool=${toolName} should_use=ctx_execute/ctx_batch_execute`;
        db.insertToolEvent(
          sid,
          "routing_violation",
          1,
          routeSummary,
          JSON.stringify({ toolName, reason: "non-sandbox execution path" }),
          false,
        );
      }

      log.debug?.("captured tool event", {
        sid,
        toolName,
        priority,
        isError,
        durationMs: event.durationMs,
      });
    });

    api.on("before_compaction", (payload?: unknown) => {
      const sid = resolveSessionId(payload, currentSessionId);
      const events = db.getRecentEvents(sid, 120);
      if (events.length === 0) return undefined;

      const searchQuery = deriveSearchQueryFromRecent(events);
      const related = searchQuery ? db.searchSession(sid, searchQuery, 6) : [];
      const snapshot = buildSnapshot(events, related, 2048);
      db.upsertResume(sid, snapshot);

      log.debug?.("snapshot built", {
        sid,
        eventCount: events.length,
        bytes: Buffer.byteLength(snapshot, "utf8"),
      });

      return {
        contextModeSnapshot: snapshot,
      };
    });

    log.info?.("registered hooks", {
      hooks: ["session_start", "after_tool_call", "before_compaction"],
      dbFile: resolve(dbFile),
    });
  },
};
