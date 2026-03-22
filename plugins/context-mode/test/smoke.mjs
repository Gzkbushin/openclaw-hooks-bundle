import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "openclaw.plugin.json"), "utf8"));
const indexTs = readFileSync(resolve(root, "index.ts"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(manifest.id === "context-mode", "manifest.id mismatch");
assert(Array.isArray(manifest.hooks), "manifest.hooks missing");
for (const hook of ["after_tool_call", "before_compaction", "session_start"]) {
  assert(manifest.hooks.includes(hook), `missing hook in manifest: ${hook}`);
  assert(indexTs.includes(`api.on(\"${hook}\"`), `hook handler not registered: ${hook}`);
}

assert(indexTs.includes("better-sqlite3"), "better-sqlite3 not used");
assert(indexTs.includes("CREATE VIRTUAL TABLE IF NOT EXISTS session_events_fts USING fts5"), "FTS5 schema missing");
assert(indexTs.includes("bm25(session_events_fts"), "BM25 query missing");
assert(indexTs.includes("buildSnapshot(events, related, 2048)"), "2KB snapshot budget missing");
assert(indexTs.includes("routing_violation"), "sandbox routing guard event missing");
assert(indexTs.includes("redactSensitiveData"), "sensitive data filter integration missing");
for (const key of ["maxContextSnapshots", "maxMemorySnapshots", "snapshotRetentionDays"]) {
  assert(indexTs.includes(key), `missing resource config: ${key}`);
  assert(Object.prototype.hasOwnProperty.call(manifest.configSchema.properties, key), `manifest config missing: ${key}`);
}
assert(indexTs.includes("cleanupResources"), "resource cleanup logic missing");
assert(indexTs.includes("resource stats"), "resource stats logging missing");

console.log("smoke test passed");
