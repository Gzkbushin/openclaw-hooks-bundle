import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import defaultPlugin, { plugin } from "../index.ts";

test("context-mode exports a plugin entry with SDK fallback support", () => {
  assert.equal(plugin, defaultPlugin);
  assert.equal(defaultPlugin.id, "context-mode");
  assert.equal(defaultPlugin.name, "Context Mode");
  assert.equal(defaultPlugin.version, "1.1.0");
  assert.equal(defaultPlugin.description, "Privacy-first context optimization for OpenClaw");
  assert.equal(typeof defaultPlugin.register, "function");
  assert.equal(defaultPlugin.configSchema.properties.dbPath.default, "~/.context-mode/db");
});

test("context-mode registers expected hooks through registerHook", () => {
  const root = mkdtempSync(join(tmpdir(), "context-mode-plugin-entry-"));
  const registrations: Array<{ event: string; priority?: number; handler: (payload?: unknown) => unknown }> = [];
  const globals = globalThis as typeof globalThis & {
    OPENCLAW_PLUGIN_CONFIG?: Record<string, unknown>;
  };
  const previousConfig = globals.OPENCLAW_PLUGIN_CONFIG;

  globals.OPENCLAW_PLUGIN_CONFIG = { dbPath: root };

  try {
    defaultPlugin.register({
      logger: {},
      on(event, handler, opts) {
        registrations.push({ event, handler, priority: opts?.priority });
      },
    });

    assert.deepEqual(
      registrations.map(({ event }) => event),
      ["session_start", "after_tool_call", "before_compaction"],
    );
    assert.equal(registrations.every(({ handler }) => typeof handler === "function"), true);
  } finally {
    if (previousConfig === undefined) {
      delete globals.OPENCLAW_PLUGIN_CONFIG;
    } else {
      globals.OPENCLAW_PLUGIN_CONFIG = previousConfig;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
