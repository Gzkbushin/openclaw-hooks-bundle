import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type RegisteredHook = {
  event: string;
  priority?: number;
  handler: (event: unknown, ctx: unknown) => unknown;
};

test("hookify-engine imports as a standalone package without quality-hooks present", async () => {
  const sourceRoot = dirname(fileURLToPath(new URL("../index.ts", import.meta.url)));
  const tempRoot = mkdtempSync(join(tmpdir(), "hookify-engine-standalone-"));
  const tempPluginDir = join(tempRoot, "hookify-engine");

  cpSync(sourceRoot, tempPluginDir, { recursive: true });

  try {
    const mod = await import(pathToFileURL(join(tempPluginDir, "index.ts")).href);
    assert.equal(mod.default.id, "hookify-engine");
    assert.equal(mod.plugin, mod.default);

    const globals = globalThis as typeof globalThis & {
      __hookifyEngineConfig?: {
        rulesDir?: string;
        configFile?: string;
        maxRegexCacheSize?: number;
      };
    };
    delete globals.__hookifyEngineConfig;

    const hooks: RegisteredHook[] = [];
    mod.default.register({
      pluginConfig: {
        rulesDir: "/tmp/hookify-rules",
        configFile: "rules.yaml",
        maxRegexCacheSize: 99,
      },
      logger: {},
      on(event: string, handler: unknown, opts?: { priority?: number }) {
        hooks.push({ event, priority: opts?.priority, handler: handler as RegisteredHook['handler'] });
      }
    });

    assert.deepEqual(
      hooks
        .map(({ event, priority }) => ({ event, priority }))
        .sort((left, right) => left.event.localeCompare(right.event)),
      [
        { event: "after_tool_call", priority: 40 },
        { event: "before_tool_call", priority: 40 }
      ]
    );
    assert.deepEqual(globals.__hookifyEngineConfig, {
      rulesDir: "/tmp/hookify-rules",
      configFile: undefined,
      maxRegexCacheSize: 99,
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
