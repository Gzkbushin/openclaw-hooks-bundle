import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { expandHome, resolvePluginConfig, withSafeErrorHandling } from "../src/shared.ts";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "hookify-shared-"));
}

const pluginConfigSchema = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    rulesDir: { type: "string" },
    configFile: { type: "string" },
    maxRegexCacheSize: { type: "integer" },
  },
} as const;

test("expandHome expands ~/ paths", () => {
  const previousHome = process.env.HOME;

  try {
    process.env.HOME = "/tmp/hookify-home";
    assert.equal(expandHome("~/rules"), "/tmp/hookify-home/rules");
    assert.equal(expandHome("/tmp/elsewhere"), "/tmp/elsewhere");
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});

test("withSafeErrorHandling returns undefined and logs errors", () => {
  const errors: string[] = [];

  const result = withSafeErrorHandling(
    "HookifyEngine/Test",
    () => {
      throw new Error("boom");
    },
    {
      error: (...args: unknown[]) => errors.push(args.join(" ")),
    }
  );

  assert.equal(result, undefined);
  assert.deepEqual(errors, ["[Hook] HookifyEngine/Test failed: boom"]);
  assert.equal(withSafeErrorHandling("HealthyHook", () => "ok"), "ok");
});

test("resolvePluginConfig loads relative config files and strips configFile keys", () => {
  const root = createTempDir();
  const configDir = join(root, "config");
  const nestedDir = join(configDir, "nested");
  const defaultConfigPath = join(configDir, "openclaw.config.json");
  const relativeConfigPath = join(configDir, "hookify.yaml");

  mkdirSync(nestedDir, { recursive: true });

  try {
    writeFileSync(defaultConfigPath, "{\"enabled\":false,\"configFile\":\"ignored.json\"}\n");
    writeFileSync(relativeConfigPath, "enabled: false\nrulesDir: from-file\nconfigFile: ignored-again.json\n");

    const resolved = resolvePluginConfig(
      { configFile: "../hookify.yaml", enabled: true },
      join(nestedDir, "plugin.config.json")
    );

    assert.deepEqual(resolved, {
      enabled: true,
      rulesDir: "from-file",
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
  const explicitConfigPath = join(configDir, "hookify.yaml");
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
        rulesDir: "default-rules",
        maxRegexCacheSize: 32,
      })
    );
    writeFileSync(
      join(home, ".openclaw-hooks.config.yaml"),
      [
        "hookifyEngine:",
        "  rulesDir: user-rules",
        "  maxRegexCacheSize: 64",
        "  ignoredSetting: no",
        "",
      ].join("\n")
    );
    writeFileSync(
      join(project, "openclaw-hooks.config.yaml"),
      [
        "hookifyEngine:",
        "  rulesDir: project-rules",
        "  maxRegexCacheSize: wrong",
        "",
      ].join("\n")
    );
    writeFileSync(explicitConfigPath, "maxRegexCacheSize: 96\n");

    process.env.HOME = home;
    process.chdir(project);

    const resolved = resolvePluginConfig(
      {
        configFile: "hookify.yaml",
        enabled: false,
      },
      defaultConfigPath,
      {
        warn: (...args: unknown[]) => warnings.push(args.join(" ")),
      },
      {
        pluginKeys: ["hookifyEngine", "hookify-engine", "hookify"],
        schema: pluginConfigSchema,
      }
    );

    assert.deepEqual(resolved, {
      enabled: false,
      rulesDir: "project-rules",
      maxRegexCacheSize: 96,
    });
    assert.match(warnings.join("\n"), /unknown key "ignoredSetting"/);
    assert.match(warnings.join("\n"), /"maxRegexCacheSize" must be integer/);
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
