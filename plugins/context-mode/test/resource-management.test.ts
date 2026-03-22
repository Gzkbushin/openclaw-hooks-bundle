import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import plugin from "../index.ts";

type RegisteredHandler = (payload?: unknown) => unknown;

const require = createRequire(import.meta.url);
const BetterSqlite3 = require("better-sqlite3") as new (path: string) => {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    get: (...args: unknown[]) => Record<string, unknown> | undefined;
    all: (...args: unknown[]) => Array<Record<string, unknown>>;
  };
  close: () => void;
};

function registerPlugin(config: Record<string, unknown>) {
  const handlers = new Map<string, RegisteredHandler>();
  const debugEntries: unknown[][] = [];
  const infoEntries: unknown[][] = [];
  const globals = globalThis as typeof globalThis & {
    OPENCLAW_PLUGIN_CONFIG?: Record<string, unknown>;
  };
  const previousConfig = globals.OPENCLAW_PLUGIN_CONFIG;

  globals.OPENCLAW_PLUGIN_CONFIG = config;

  plugin.register({
    logger: {
      info: (...args: unknown[]) => infoEntries.push(args),
      warn: () => {},
      error: () => {},
      debug: (...args: unknown[]) => debugEntries.push(args),
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
  });

  return {
    handlers,
    debugEntries,
    infoEntries,
    restore() {
      if (previousConfig === undefined) {
        delete globals.OPENCLAW_PLUGIN_CONFIG;
        return;
      }
      globals.OPENCLAW_PLUGIN_CONFIG = previousConfig;
    },
  };
}

function openDb(root: string) {
  return new BetterSqlite3(join(root, "context-mode-openclaw.db"));
}

test("context-mode enforces FIFO cleanup for memory snapshots and logs resource stats", { concurrency: false }, () => {
  const root = mkdtempSync(join(tmpdir(), "context-mode-resource-memory-"));
  const { handlers, debugEntries, infoEntries, restore } = registerPlugin({
    dbPath: root,
    maxMemorySnapshots: 3,
  });

  try {
    const afterToolCall = handlers.get("after_tool_call");
    assert.ok(afterToolCall);

    for (const name of ["one", "two", "three", "four"]) {
      afterToolCall?.({
        sessionId: "memory-session",
        toolName: "read",
        params: { path: `/tmp/${name}.txt` },
        result: `result-${name}`,
      });
    }

    const db = openDb(root);
    const rows = db
      .prepare("SELECT detail FROM session_events ORDER BY id ASC")
      .all() as Array<{ detail: string }>;
    db.close();

    assert.equal(rows.length, 3);
    const detailText = rows.map((row) => row.detail).join("\n");
    assert.equal(detailText.includes("/tmp/one.txt"), false);
    assert.match(detailText, /\/tmp\/two\.txt/);
    assert.match(detailText, /\/tmp\/three\.txt/);
    assert.match(detailText, /\/tmp\/four\.txt/);

    assert.equal(
      debugEntries.some((entry) => entry[1] === "resource stats" && (entry[2] as { reason?: string })?.reason === "after_tool_call"),
      true,
    );
    assert.equal(
      infoEntries.some((entry) => entry[1] === "resource cleanup" && (entry[2] as { deletedMemorySnapshots?: number })?.deletedMemorySnapshots === 1),
      true,
    );
  } finally {
    restore();
    rmSync(root, { recursive: true, force: true });
  }
});

test("context-mode enforces FIFO cleanup for context snapshots across sessions", { concurrency: false }, () => {
  const root = mkdtempSync(join(tmpdir(), "context-mode-resource-context-"));
  const { handlers, restore } = registerPlugin({
    dbPath: root,
    maxContextSnapshots: 2,
  });

  try {
    const afterToolCall = handlers.get("after_tool_call");
    const beforeCompaction = handlers.get("before_compaction");
    const sessionStart = handlers.get("session_start");
    assert.ok(afterToolCall);
    assert.ok(beforeCompaction);
    assert.ok(sessionStart);

    for (const sessionId of ["session-a", "session-b", "session-c"]) {
      afterToolCall?.({
        sessionId,
        toolName: "read",
        params: { path: `/tmp/${sessionId}.txt` },
        result: `result-${sessionId}`,
      });
      beforeCompaction?.({ sessionId });
    }

    const db = openDb(root);
    const rows = db
      .prepare("SELECT session_id FROM session_resume ORDER BY created_at ASC, session_id ASC")
      .all() as Array<{ session_id: string }>;
    db.close();

    assert.deepEqual(rows.map((row) => row.session_id), ["session-b", "session-c"]);
    assert.equal(sessionStart?.({ sessionId: "session-a" }), undefined);

    const restored = sessionStart?.({ sessionId: "session-b" }) as { prependSystemContext?: string } | undefined;
    assert.match(String(restored?.prependSystemContext), /session-b/);
  } finally {
    restore();
    rmSync(root, { recursive: true, force: true });
  }
});

test("context-mode removes expired memory and context snapshots using retention days", { concurrency: false }, () => {
  const root = mkdtempSync(join(tmpdir(), "context-mode-resource-retention-"));
  const { handlers, infoEntries, restore } = registerPlugin({
    dbPath: root,
    snapshotRetentionDays: 1,
  });

  try {
    const afterToolCall = handlers.get("after_tool_call");
    const beforeCompaction = handlers.get("before_compaction");
    assert.ok(afterToolCall);
    assert.ok(beforeCompaction);

    afterToolCall?.({
      sessionId: "expired-session",
      toolName: "read",
      params: { path: "/tmp/expired.txt" },
      result: "expired-result",
    });
    beforeCompaction?.({ sessionId: "expired-session" });

    const db = openDb(root);
    db.exec(`
      UPDATE session_events SET created_at = datetime('now', '-3 days');
      UPDATE session_resume SET created_at = datetime('now', '-3 days');
    `);
    db.close();

    afterToolCall?.({
      sessionId: "fresh-session",
      toolName: "read",
      params: { path: "/tmp/fresh.txt" },
      result: "fresh-result",
    });
    beforeCompaction?.({ sessionId: "fresh-session" });

    const freshDb = openDb(root);
    const eventRows = freshDb
      .prepare("SELECT session_id FROM session_events ORDER BY id ASC")
      .all() as Array<{ session_id: string }>;
    const resumeRows = freshDb
      .prepare("SELECT session_id FROM session_resume ORDER BY created_at ASC, session_id ASC")
      .all() as Array<{ session_id: string }>;
    freshDb.close();

    assert.deepEqual(eventRows.map((row) => row.session_id), ["fresh-session"]);
    assert.deepEqual(resumeRows.map((row) => row.session_id), ["fresh-session"]);
    assert.equal(
      infoEntries.some((entry) => entry[1] === "resource cleanup" && (entry[2] as { deletedContextSnapshots?: number })?.deletedContextSnapshots === 1),
      true,
    );
    assert.equal(
      infoEntries.some((entry) => entry[1] === "resource cleanup" && (entry[2] as { deletedMemorySnapshots?: number })?.deletedMemorySnapshots === 1),
      true,
    );
  } finally {
    restore();
    rmSync(root, { recursive: true, force: true });
  }
});
