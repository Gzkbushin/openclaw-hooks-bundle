import test from "node:test";
import assert from "node:assert/strict";

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
