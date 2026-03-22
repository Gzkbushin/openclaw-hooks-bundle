import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import {
  loadJsonObjectFile,
  maybeFormatJsonFallback,
  resolvePluginConfig,
  spawnBackground
} from "../hooks/shared.ts";

function createTempDir() {
  return mkdtempSync(join(tmpdir(), "openclaw-shared-"));
}

const pluginConfigSchema = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    logDir: { type: "string" },
    audit: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        fileName: { type: "string" },
        maxFiles: { type: "integer" }
      }
    }
  }
} as const;

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
    assert.match(warnings.join("\n"), /Ignoring config in .*invalid\.json/);
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

test("loadJsonObjectFile also supports YAML object files", () => {
  const root = createTempDir();
  const configPath = join(root, "openclaw-hooks.config.yaml");

  try {
    writeFileSync(
      configPath,
      [
        "enabled: true",
        "logDir: project-log",
        "audit:",
        "  enabled: false",
        "  maxFiles: 9",
        ""
      ].join("\n")
    );

    assert.deepEqual(loadJsonObjectFile(configPath), {
      enabled: true,
      logDir: "project-log",
      audit: {
        enabled: false,
        maxFiles: 9
      }
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolvePluginConfig merges default, user, project, explicit, and inline config layers", () => {
  const root = createTempDir();
  const home = join(root, "home");
  const project = join(root, "project");
  const configDir = join(root, "config");
  const defaultConfigPath = join(configDir, "openclaw.config.json");
  const explicitConfigPath = join(configDir, "quality.yaml");
  const warnings: string[] = [];
  const previousHome = process.env.HOME;
  const previousCwd = process.cwd();

  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });
  mkdirSync(configDir, { recursive: true });

  try {
    writeFileSync(
      defaultConfigPath,
      JSON.stringify({
        enabled: true,
        logDir: "default-log",
        audit: { enabled: true, fileName: "default-audit.jsonl", maxFiles: 3 }
      })
    );
    writeFileSync(
      join(home, ".openclaw-hooks.config.yaml"),
      [
        "qualityHooks:",
        "  logDir: user-log",
        "  audit:",
        "    maxFiles: 5",
        "    ignoredSetting: no",
        ""
      ].join("\n")
    );
    writeFileSync(
      join(project, "openclaw-hooks.config.yaml"),
      [
        "qualityHooks:",
        "  logDir: project-log",
        "  audit:",
        "    fileName: project-audit.jsonl",
        "    maxFiles: wrong",
        ""
      ].join("\n")
    );
    writeFileSync(
      explicitConfigPath,
      [
        "audit:",
        "  maxFiles: 7",
        ""
      ].join("\n")
    );

    process.env.HOME = home;
    process.chdir(project);

    const resolved = resolvePluginConfig(
      {
        configFile: "quality.yaml",
        audit: { enabled: false }
      },
      defaultConfigPath,
      {
        warn: (...args: unknown[]) => warnings.push(args.join(" "))
      },
      {
        pluginKeys: ["qualityHooks", "openclaw-quality-hooks"],
        schema: pluginConfigSchema
      }
    );

    assert.deepEqual(resolved, {
      enabled: true,
      logDir: "project-log",
      audit: {
        enabled: false,
        fileName: "project-audit.jsonl",
        maxFiles: 7
      }
    });
    assert.match(warnings.join("\n"), /unknown key "ignoredSetting"/);
    assert.match(warnings.join("\n"), /"maxFiles" must be integer/);
  } finally {
    process.chdir(previousCwd);
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
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
