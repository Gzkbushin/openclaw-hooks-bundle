import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadJsonObjectFile,
  maybeFormatJsonFallback,
  resolvePluginConfig,
  spawnBackground
} from "../hooks/shared.ts";

function createTempDir() {
  return mkdtempSync(join(tmpdir(), "openclaw-shared-"));
}

function waitForBackgroundWork() {
  return new Promise(resolve => setTimeout(resolve, 250));
}

test("loadJsonObjectFile warns for non-object and invalid JSON files", () => {
  const root = createTempDir();
  const warnings: string[] = [];
  const logger = {
    warn: (...args: unknown[]) => warnings.push(args.join(" "))
  };

  try {
    const arrayFile = join(root, "array.json");
    const invalidFile = join(root, "invalid.json");
    writeFileSync(arrayFile, "[1,2,3]\n");
    writeFileSync(invalidFile, "{broken\n");

    assert.deepEqual(loadJsonObjectFile(arrayFile, logger), {});
    assert.deepEqual(loadJsonObjectFile(invalidFile, logger), {});
    assert.match(warnings.join("\n"), /expected a JSON object/);
    assert.match(warnings.join("\n"), /Failed to read config file/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolvePluginConfig loads relative config files and strips configFile keys", () => {
  const root = createTempDir();
  const configDir = join(root, "config");
  const nestedDir = join(configDir, "nested");
  mkdirSync(nestedDir, { recursive: true });
  const defaultConfigPath = join(configDir, "openclaw.config.json");
  const relativeConfigPath = join(configDir, "quality.json");

  try {
    writeFileSync(defaultConfigPath, "{\"enabled\":false,\"configFile\":\"ignored.json\"}\n");
    writeFileSync(relativeConfigPath, "{\"enabled\":false,\"logDir\":\"from-file\",\"configFile\":\"ignored-again.json\"}\n");

    const resolved = resolvePluginConfig(
      { configFile: "../quality.json", enabled: true },
      join(nestedDir, "plugin.config.json")
    );

    assert.deepEqual(resolved, {
      enabled: true,
      logDir: "from-file"
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("maybeFormatJsonFallback returns false for invalid JSON", () => {
  const root = createTempDir();
  const filePath = join(root, "broken.json");

  try {
    writeFileSync(filePath, "{broken\n");
    assert.equal(maybeFormatJsonFallback(filePath), false);
    assert.equal(readFileSync(filePath, "utf8"), "{broken\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("spawnBackground logs failures to start and non-zero exits", async () => {
  const root = createTempDir();
  const logDir = join(root, "logs");
  const warnings: string[] = [];

  try {
    const logger = {
      warn: (...args: unknown[]) => warnings.push(args.map(value => String(value)).join(" "))
    };

    spawnBackground(
      "/bin/bash",
      ["-lc", "printf 'stdout line\\n'; printf 'stderr line\\n' >&2; exit 2"],
      root,
      logger,
      "Failing check",
      logDir
    );
    spawnBackground(join(root, "missing-command"), [], root, logger, "Missing check", logDir);

    await waitForBackgroundWork();

    const log = readFileSync(join(logDir, "quality-gate.log"), "utf8");
    assert.match(warnings.join("\n"), /Failing check reported issues/);
    assert.match(warnings.join("\n"), /Missing check failed to start/);
    assert.match(log, /Failing check exited with code 2/);
    assert.match(log, /stdout line/);
    assert.match(log, /stderr line/);
    assert.match(log, /Missing check failed to start/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
