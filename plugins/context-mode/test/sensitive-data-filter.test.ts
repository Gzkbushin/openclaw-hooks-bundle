import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import plugin from "../index.ts";
import { redactSensitiveData, redactSensitiveText } from "../sensitive-data-filter.ts";

type RegisteredHandler = (payload?: unknown) => unknown;

function registerPlugin(dbPath: string) {
  const handlers = new Map<string, RegisteredHandler>();
  const globals = globalThis as typeof globalThis & {
    OPENCLAW_PLUGIN_CONFIG?: Record<string, unknown>;
  };
  const previousConfig = globals.OPENCLAW_PLUGIN_CONFIG;

  globals.OPENCLAW_PLUGIN_CONFIG = { dbPath };

  plugin.register({
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
  });

  return {
    handlers,
    restore() {
      if (previousConfig === undefined) {
        delete globals.OPENCLAW_PLUGIN_CONFIG;
        return;
      }
      globals.OPENCLAW_PLUGIN_CONFIG = previousConfig;
    },
  };
}

test("redactSensitiveText masks common secrets in free-form text", () => {
  const input = [
    "email=alice@example.com",
    "phone=+1 (415) 555-2671",
    "password=hunter2",
    "apiKey=sk-abcdefghijklmnopqrstuv",
    "token=ghp_abcdefghijklmnopqrstuvwxyz123456",
  ].join(" | ");

  const redacted = redactSensitiveText(input);

  assert.equal(redacted.includes("alice@example.com"), false);
  assert.equal(redacted.includes("hunter2"), false);
  assert.equal(redacted.includes("sk-abcdefghijklmnopqrstuv"), false);
  assert.equal(redacted.includes("ghp_abcdefghijklmnopqrstuvwxyz123456"), false);
  assert.match(redacted, /\[REDACTED:email]/);
  assert.match(redacted, /\[REDACTED:phone]/);
  assert.match(redacted, /\[REDACTED:password]/);
  assert.match(redacted, /\[REDACTED:api_key]/);
  assert.match(redacted, /\[REDACTED:token]/);
});

test("redactSensitiveData masks nested structured values", () => {
  const input = {
    password: "hunter2",
    profile: {
      email: "alice@example.com",
      phone: "138-0013-8000",
    },
    headers: {
      authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
      clientSecret: "top-secret",
    },
  };

  const redacted = redactSensitiveData(input);

  assert.deepEqual(redacted, {
    password: "[REDACTED:password]",
    profile: {
      email: "[REDACTED:email]",
      phone: "[REDACTED:phone]",
    },
    headers: {
      authorization: "Bearer [REDACTED:token]",
      clientSecret: "[REDACTED:api_key]",
    },
  });
});

test("redactSensitiveText preserves non-secret numbers and redacts jwt and aws keys", () => {
  const input = [
    "short=123-4567",
    "jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
    "aws=AKIA1234567890ABCDEF",
  ].join(" | ");

  const redacted = redactSensitiveText(input);

  assert.match(redacted, /123-4567/);
  assert.equal(redacted.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature"), false);
  assert.equal(redacted.includes("AKIA1234567890ABCDEF"), false);
  assert.match(redacted, /\[REDACTED:token]/);
  assert.match(redacted, /\[REDACTED:api_key]/);
});

test("redactSensitiveData preserves primitives and handles arrays and circular references", () => {
  assert.equal(redactSensitiveData(null), null);
  assert.equal(redactSensitiveData(42), 42);

  const input: Record<string, unknown> = {
    accessToken: "ghp_abcdefghijklmnopqrstuvwxyz123456",
    nested: [
      "call me at +1 (415) 555-2671",
      {
        secretKey: "AKIA1234567890ABCDEF",
      },
    ],
  };
  input.self = input;

  const redacted = redactSensitiveData(input) as Record<string, unknown> & { self?: unknown };

  assert.equal(redacted.accessToken, "[REDACTED:token]");
  assert.deepEqual(redacted.nested, [
    "call me at [REDACTED:phone]",
    {
      secretKey: "[REDACTED:api_key]",
    },
  ]);
  assert.equal(redacted.self, redacted);
});

test("context-mode snapshots and resume payloads are redacted", () => {
  const root = mkdtempSync(join(tmpdir(), "context-mode-privacy-"));
  const { handlers, restore } = registerPlugin(root);

  try {
    const afterToolCall = handlers.get("after_tool_call");
    const beforeCompaction = handlers.get("before_compaction");
    const sessionStart = handlers.get("session_start");

    assert.ok(afterToolCall);
    assert.ok(beforeCompaction);
    assert.ok(sessionStart);

    afterToolCall?.({
      sessionId: "privacy-session",
      toolName: "exec",
      params: {
        command: "curl https://api.example.com?token=ghp_abcdefghijklmnopqrstuvwxyz123456",
        email: "alice@example.com",
        password: "hunter2",
      },
      result: "Reach me at +1 (415) 555-2671 or use sk-abcdefghijklmnopqrstuv",
    });

    const snapshotResult = beforeCompaction?.({
      sessionId: "privacy-session",
    }) as { contextModeSnapshot?: string } | undefined;

    assert.ok(snapshotResult?.contextModeSnapshot);

    const snapshot = snapshotResult.contextModeSnapshot ?? "";
    assert.equal(snapshot.includes("ghp_abcdefghijklmnopqrstuvwxyz123456"), false);
    assert.equal(snapshot.includes("sk-abcdefghijklmnopqrstuv"), false);
    assert.match(snapshot, /\[REDACTED:phone]/);
    assert.match(snapshot, /\[REDACTED:token]/);
    assert.match(snapshot, /\[REDACTED:api_key]/);

    const require = createRequire(import.meta.url);
    const BetterSqlite3 = require("better-sqlite3") as new (path: string) => {
      prepare: (sql: string) => {
        get: (...args: unknown[]) => Record<string, string> | undefined;
      };
      close: () => void;
    };
    const db = new BetterSqlite3(join(root, "context-mode-openclaw.db"));
    const detailRow = db
      .prepare("SELECT detail FROM session_events WHERE session_id = ? AND tool_name = ? ORDER BY id DESC LIMIT 1")
      .get("privacy-session", "exec");
    db.close();

    const detail = detailRow?.detail ?? "";
    assert.equal(detail.includes("alice@example.com"), false);
    assert.equal(detail.includes("hunter2"), false);
    assert.equal(detail.includes("ghp_abcdefghijklmnopqrstuvwxyz123456"), false);
    assert.equal(detail.includes("sk-abcdefghijklmnopqrstuv"), false);
    assert.match(detail, /\[REDACTED:email]/);
    assert.match(detail, /\[REDACTED:password]/);
    assert.match(detail, /\[REDACTED:phone]/);
    assert.match(detail, /\[REDACTED:token]/);
    assert.match(detail, /\[REDACTED:api_key]/);

    const resumeResult = sessionStart?.({
      sessionId: "privacy-session",
    }) as { prependSystemContext?: string } | undefined;

    assert.ok(resumeResult?.prependSystemContext);
    assert.equal(resumeResult?.prependSystemContext?.includes("hunter2"), false);
    assert.match(String(resumeResult?.prependSystemContext), /\[REDACTED:token]/);
  } finally {
    restore();
    rmSync(root, { recursive: true, force: true });
  }
});
