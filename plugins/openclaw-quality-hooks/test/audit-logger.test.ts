import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getAuditLogPath, queryAuditEvents, writeAuditEvent } from "../hooks/audit-logger.ts";
import { runDangerBlocker } from "../hooks/danger-blocker.ts";

function createTempLogDir() {
  return mkdtempSync(join(tmpdir(), "openclaw-audit-log-"));
}

test("writeAuditEvent stores audit records as JSON lines", () => {
  const logDir = createTempLogDir();

  try {
    const entry = writeAuditEvent(logDir, {
      type: "dangerous_command_blocked",
      action: "blocked",
      severity: "critical",
      toolName: "exec",
      command: "rm -rf /tmp/demo",
      reason: "Blocked dangerous command: `rm -rf` requires `approved: true`."
    });

    assert.ok(entry?.timestamp);
    const filePath = getAuditLogPath(logDir);
    const lines = readFileSync(filePath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), entry);
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});

test("writeAuditEvent rotates audit logs when they exceed the configured size", () => {
  const logDir = createTempLogDir();
  const config = { maxBytes: 190, maxFiles: 3 };

  try {
    writeAuditEvent(
      logDir,
      {
        timestamp: "2026-03-22T10:00:00.000Z",
        type: "dangerous_command_blocked",
        action: "blocked",
        severity: "critical",
        toolName: "exec",
        command: "rm -rf /tmp/one",
        reason: "blocked"
      },
      config
    );
    writeAuditEvent(
      logDir,
      {
        timestamp: "2026-03-22T10:01:00.000Z",
        type: "git_hook_bypass_blocked",
        action: "blocked",
        severity: "critical",
        toolName: "bash",
        command: "git commit --no-verify",
        reason: "blocked"
      },
      config
    );
    writeAuditEvent(
      logDir,
      {
        timestamp: "2026-03-22T10:02:00.000Z",
        type: "unsafe_editor_exit_blocked",
        action: "blocked",
        severity: "critical",
        toolName: "bash",
        command: "vim :q!",
        reason: "blocked"
      },
      config
    );

    const currentPath = getAuditLogPath(logDir, config);
    const rotatedPath = `${currentPath}.1`;
    assert.equal(readFileSync(currentPath, "utf8").trim().split("\n").length, 1);
    assert.equal(readFileSync(rotatedPath, "utf8").trim().split("\n").length >= 1, true);
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});

test("queryAuditEvents filters audit records by type and time", () => {
  const logDir = createTempLogDir();

  try {
    writeAuditEvent(logDir, {
      timestamp: "2026-03-22T09:00:00.000Z",
      type: "dangerous_command_blocked",
      action: "blocked",
      severity: "critical",
      toolName: "exec",
      command: "rm -rf /tmp/one",
      reason: "blocked"
    });
    writeAuditEvent(logDir, {
      timestamp: "2026-03-22T09:30:00.000Z",
      type: "config_change",
      action: "observed",
      severity: "info",
      toolName: "config",
      reason: "Audit configuration updated"
    });
    writeAuditEvent(logDir, {
      timestamp: "2026-03-22T10:00:00.000Z",
      type: "dangerous_command_allowed",
      action: "allowed",
      severity: "warn",
      toolName: "exec",
      command: "rm -rf /tmp/two",
      reason: "approved"
    });

    const filtered = queryAuditEvents(logDir, {
      type: ["dangerous_command_blocked", "dangerous_command_allowed"],
      since: "2026-03-22T09:15:00.000Z"
    });

    assert.deepEqual(filtered.map(event => event.type), ["dangerous_command_allowed"]);
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});

test("danger blocker writes audit records for blocked and approved dangerous commands", () => {
  const logDir = createTempLogDir();

  try {
    const blocked = runDangerBlocker(
      { toolName: "exec", params: { command: "rm -rf /tmp/demo" } },
      {},
      logDir,
      undefined,
      { sessionId: "session-1", runId: "run-1" }
    );
    const allowed = runDangerBlocker(
      { toolName: "exec", params: { command: "rm -rf /tmp/demo", approved: true } },
      {},
      logDir,
      undefined,
      { sessionId: "session-2", runId: "run-2" }
    );

    assert.equal(blocked?.block, true);
    assert.equal(allowed, undefined);

    const events = queryAuditEvents(logDir);
    assert.deepEqual(
      events
        .map(event => ({
          type: event.type,
          action: event.action,
          approved: event.approved,
          sessionId: event.sessionId
        }))
        .sort((left, right) => left.type.localeCompare(right.type)),
      [
        {
          type: "dangerous_command_allowed",
          action: "allowed",
          approved: true,
          sessionId: "session-2"
        },
        {
          type: "dangerous_command_blocked",
          action: "blocked",
          approved: false,
          sessionId: "session-1"
        }
      ]
    );
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});

test("danger blocker still blocks commands when audit logging fails", () => {
  const root = createTempLogDir();
  const badLogDir = join(root, "audit-target");
  const warnings: string[] = [];
  writeFileSync(badLogDir, "not-a-directory\n");

  try {
    const result = runDangerBlocker(
      { toolName: "exec", params: { command: "rm -rf /tmp/demo" } },
      { warn: (...args: unknown[]) => warnings.push(args.join(" ")) },
      badLogDir
    );

    assert.equal(result?.block, true);
    assert.match(warnings.join("\n"), /AuditLogger failed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
