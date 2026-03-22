import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import plugin from "../index.ts";
import { withSafeErrorHandling } from "../hooks/shared.ts";

type RegisteredHandler = (event: any, ctx: any) => unknown;

function createTempProject() {
  const root = mkdtempSync(join(tmpdir(), "openclaw-quality-hooks-errors-"));
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  return root;
}

function writeExecutable(path: string, content: string) {
  writeFileSync(path, content, { mode: 0o755 });
}

function registerHandlers(logDir: string, logger: Record<string, (...args: unknown[]) => void>) {
  const handlers = new Map<string, RegisteredHandler>();

  plugin.register({
    pluginConfig: { logDir },
    logger,
    on(hookName, handler) {
      handlers.set(hookName, handler);
    }
  });

  return {
    beforeToolCall: handlers.get("before_tool_call"),
    afterToolCall: handlers.get("after_tool_call")
  };
}

test("withSafeErrorHandling returns undefined and logs errors", () => {
  const errors: string[] = [];

  const result = withSafeErrorHandling(
    "ExampleHook",
    () => {
      throw new Error("boom");
    },
    {
      error: (...args: unknown[]) => errors.push(args.join(" "))
    }
  );

  assert.equal(result, undefined);
  assert.deepEqual(errors, ["[Hook] ExampleHook failed: boom"]);
  assert.equal(withSafeErrorHandling("HealthyHook", () => "ok"), "ok");
});

test("before_tool_call keeps the pipeline running when danger blocker fails", () => {
  const root = createTempProject();
  const warnings: string[] = [];
  const errors: string[] = [];
  const previousTmux = process.env.TMUX;
  delete process.env.TMUX;

  try {
    const { beforeToolCall } = registerHandlers(root, {
      info: () => {},
      warn: (...args: unknown[]) => warnings.push(args.join(" ")),
      error: (...args: unknown[]) => errors.push(args.join(" "))
    });

    assert.ok(beforeToolCall);

    let approvedReads = 0;
    const params: Record<string, unknown> = {
      command: "git push origin main && rm -rf /tmp/demo"
    };
    Object.defineProperty(params, "approved", {
      enumerable: true,
      get() {
        approvedReads += 1;
        if (approvedReads === 1) {
          throw new Error("approval lookup failed");
        }
        return false;
      }
    });

    const result = beforeToolCall(
      {
        toolName: "exec",
        params
      },
      {
        sessionId: "session-1"
      }
    );

    assert.equal(result, undefined);
    assert.match(warnings.join("\n"), /Review changes before push/);
    assert.deepEqual(errors, ["[Hook] DangerBlocker failed: approval lookup failed"]);
  } finally {
    process.env.TMUX = previousTmux;
    rmSync(root, { recursive: true, force: true });
  }
});

test("after_tool_call keeps later hooks running when console audit fails", async () => {
  const root = createTempProject();
  const filePath = join(root, "src", "demo.ts");
  const markerPath = join(root, "quality.log");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(filePath, "console.log('debug');\nconst   value=1;\n");
  writeFileSync(join(root, "package.json"), "{\"name\":\"demo\"}");
  writeFileSync(join(root, "tsconfig.json"), "{\"compilerOptions\":{\"target\":\"ES2022\"}}");
  writeExecutable(
    join(root, "node_modules", ".bin", "prettier"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const file = process.argv[process.argv.length - 1];
fs.writeFileSync(file, "// prettier-ran\\n", "utf8");
`
  );
  writeExecutable(
    join(root, "node_modules", ".bin", "tsc"),
    `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(markerPath)}, "tsc\\n");
`
  );
  writeExecutable(
    join(root, "node_modules", ".bin", "eslint"),
    `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(markerPath)}, "eslint\\n");
`
  );

  const errors: string[] = [];

  try {
    const { afterToolCall } = registerHandlers(root, {
      info: () => {},
      warn: () => {},
      error: (...args: unknown[]) => errors.push(args.join(" "))
    });

    assert.ok(afterToolCall);

    let filePathReads = 0;
    const params: Record<string, unknown> = {};
    Object.defineProperty(params, "file_path", {
      enumerable: true,
      get() {
        filePathReads += 1;
        if (filePathReads === 1) {
          throw new Error("file path lookup failed");
        }
        return filePath;
      }
    });

    const result = afterToolCall({
      toolName: "edit",
      params
    }, {});

    assert.equal(result, undefined);
    await new Promise(resolve => setTimeout(resolve, 300));

    assert.equal(readFileSync(filePath, "utf8"), "// prettier-ran\n");
    const qualityLog = readFileSync(markerPath, "utf8");
    assert.match(qualityLog, /tsc/);
    assert.match(qualityLog, /eslint/);
    assert.deepEqual(errors, ["[Hook] ConsoleLogAudit failed: file path lookup failed"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
