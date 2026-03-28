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

test("openclaw-quality-hooks imports as a standalone package without hookify-engine present", async () => {
  const sourceRoot = dirname(fileURLToPath(new URL("../index.ts", import.meta.url)));
  const tempRoot = mkdtempSync(join(tmpdir(), "openclaw-quality-hooks-standalone-"));
  const tempPluginDir = join(tempRoot, "openclaw-quality-hooks");

  cpSync(sourceRoot, tempPluginDir, { recursive: true });

  try {
    const mod = await import(pathToFileURL(join(tempPluginDir, "index.ts")).href);
    assert.equal(mod.default.id, "openclaw-quality-hooks");
    assert.equal(mod.plugin, mod.default);

    const hooks: RegisteredHook[] = [];
    const infoLogs: string[] = [];

    mod.default.register({
      logger: {
        info: (...args: unknown[]) => infoLogs.push(args.join(" "))
      },
      registerHook(hook: RegisteredHook) {
        hooks.push(hook);
      }
    });

    assert.deepEqual(
      hooks
        .map(({ event, priority }) => ({ event, priority }))
        .sort((left, right) => left.event.localeCompare(right.event)),
      [
        { event: "after_tool_call", priority: 50 },
        { event: "before_tool_call", priority: 50 }
      ]
    );
    assert.match(infoLogs.join("\n"), /hookify-engine not available/);

    const beforeToolCall = hooks.find(hook => hook.event === "before_tool_call")?.handler;
    assert.ok(beforeToolCall);

    const result = beforeToolCall(
      {
        toolName: "exec",
        params: { command: "rm -rf /tmp/demo" }
      },
      {}
    ) as { block?: boolean; blockReason?: string } | undefined;

    assert.equal(result?.block, true);
    assert.match(String(result?.blockReason), /rm -rf/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
