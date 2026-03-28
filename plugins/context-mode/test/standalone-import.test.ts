import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("context-mode imports as a standalone package without quality-hooks present", async () => {
  const sourceRoot = dirname(fileURLToPath(new URL("../index.ts", import.meta.url)));
  const tempRoot = mkdtempSync(join(tmpdir(), "context-mode-standalone-"));
  const tempPluginDir = join(tempRoot, "context-mode");

  mkdirSync(tempPluginDir, { recursive: true });
  copyFileSync(join(sourceRoot, "index.ts"), join(tempPluginDir, "index.ts"));
  copyFileSync(join(sourceRoot, "config-loader.ts"), join(tempPluginDir, "config-loader.ts"));
  copyFileSync(join(sourceRoot, "sensitive-data-filter.ts"), join(tempPluginDir, "sensitive-data-filter.ts"));
  copyFileSync(join(sourceRoot, "openclaw.config.json"), join(tempPluginDir, "openclaw.config.json"));

  try {
    const mod = await import(pathToFileURL(join(tempPluginDir, "index.ts")).href);
    assert.equal(mod.default.id, "context-mode");
    assert.equal(mod.plugin, mod.default);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
