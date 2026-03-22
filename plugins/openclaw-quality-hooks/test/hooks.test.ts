import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import plugin from "../index.ts";
import { runAutoFormatter } from "../hooks/auto-formatter.ts";
import { runConsoleLogAudit } from "../hooks/console-log-audit.ts";
import { runDangerBlocker } from "../hooks/danger-blocker.ts";
import { scheduleQualityGate } from "../hooks/quality-gate.ts";
import { runSmartReminder } from "../hooks/smart-reminder.ts";

function createTempProject() {
  const root = mkdtempSync(join(tmpdir(), "openclaw-quality-hooks-"));
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  return root;
}

function writeExecutable(path: string, content: string) {
  writeFileSync(path, content, { mode: 0o755 });
}

test("danger blocker blocks rm -rf without approval", () => {
  const result = runDangerBlocker({ toolName: "exec", params: { command: "rm -rf /tmp/demo" } });
  assert.equal(result?.block, true);
  assert.match(String(result?.blockReason), /rm -rf/);
});

test("danger blocker allows rm -rf with approved true", () => {
  const result = runDangerBlocker({ toolName: "exec", params: { command: "rm -rf /tmp/demo", approved: true } });
  assert.equal(result, undefined);
});

test("danger blocker blocks --no-verify and :q!", () => {
  const noVerify = runDangerBlocker({ toolName: "bash", params: { command: "git commit --no-verify -m test" } });
  const forceQuit = runDangerBlocker({ toolName: "bash", params: { command: "vim :q!" } });
  assert.equal(noVerify?.block, true);
  assert.equal(forceQuit?.block, true);
});

test("danger blocker allows safe exec commands", () => {
  const result = runDangerBlocker({ toolName: "exec", params: { command: "echo hello" } });
  assert.equal(result, undefined);
});

test("smart reminder warns for long command and git push", () => {
  const warnings: string[] = [];
  const logger = {
    warn: (...args: unknown[]) => warnings.push(args.join(" "))
  };
  const oldTmux = process.env.TMUX;
  delete process.env.TMUX;
  runSmartReminder({ toolName: "exec", params: { command: "npm test" } }, { sessionId: "s1" }, logger, "/tmp");
  runSmartReminder({ toolName: "exec", params: { command: "git push origin main" } }, { sessionId: "s1" }, logger, "/tmp");
  process.env.TMUX = oldTmux;
  assert.equal(warnings.length >= 3, true);
  assert.match(warnings.join("\n"), /tmux/);
  assert.match(warnings.join("\n"), /Review changes before push/);
});

test("auto formatter formats JSON with builtin fallback", () => {
  const root = createTempProject();
  const filePath = join(root, "data.json");
  writeFileSync(filePath, "{\"a\":1,\"b\":{\"c\":2}}");
  runAutoFormatter({ toolName: "write", params: { file_path: filePath } }, {});
  const formatted = readFileSync(filePath, "utf8");
  assert.match(formatted, /\n  "a": 1,/);
  rmSync(root, { recursive: true, force: true });
});

test("auto formatter uses local prettier when present", () => {
  const root = createTempProject();
  const filePath = join(root, "demo.ts");
  writeFileSync(filePath, "const   value=1;\n");
  writeExecutable(
    join(root, "node_modules", ".bin", "prettier"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const file = process.argv[process.argv.length - 1];
fs.writeFileSync(file, "// prettier-ran\\n", "utf8");
`
  );
  writeFileSync(join(root, "package.json"), "{\"name\":\"demo\"}");
  runAutoFormatter({ toolName: "edit", params: { file_path: filePath } }, {});
  assert.equal(readFileSync(filePath, "utf8"), "// prettier-ran\n");
  rmSync(root, { recursive: true, force: true });
});

test("auto formatter falls back to prettier when biome fails", () => {
  const root = createTempProject();
  const filePath = join(root, "demo.ts");
  const markerPath = join(root, "formatter.log");
  writeFileSync(filePath, "const   value=1;\n");
  writeExecutable(
    join(root, "node_modules", ".bin", "biome"),
    `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(markerPath)}, "biome\\n");
process.exit(1);
`
  );
  writeExecutable(
    join(root, "node_modules", ".bin", "prettier"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const file = process.argv[process.argv.length - 1];
fs.appendFileSync(${JSON.stringify(markerPath)}, "prettier\\n");
fs.writeFileSync(file, "// prettier-fallback\\n", "utf8");
`
  );
  writeFileSync(join(root, "package.json"), "{\"name\":\"demo\"}");

  runAutoFormatter({ toolName: "edit", params: { file_path: filePath } }, {});

  assert.equal(readFileSync(filePath, "utf8"), "// prettier-fallback\n");
  assert.equal(readFileSync(markerPath, "utf8"), "biome\nprettier\n");
  rmSync(root, { recursive: true, force: true });
});

test("auto formatter runs ruff for python files", () => {
  const root = createTempProject();
  const filePath = join(root, "demo.py");
  writeFileSync(filePath, "x=1\n");
  writeExecutable(
    join(root, "node_modules", ".bin", "ruff"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const file = process.argv[process.argv.length - 1];
fs.writeFileSync(file, "# ruff-ran\\n", "utf8");
`
  );
  writeFileSync(join(root, "package.json"), "{\"name\":\"demo\"}");

  runAutoFormatter({ toolName: "edit", params: { file_path: filePath } }, {});

  assert.equal(readFileSync(filePath, "utf8"), "# ruff-ran\n");
  rmSync(root, { recursive: true, force: true });
});

test("console log audit warns when console.log is present", () => {
  const root = createTempProject();
  const filePath = join(root, "debug.ts");
  const warnings: string[] = [];
  writeFileSync(filePath, "console.log('debug');\n");

  runConsoleLogAudit(
    { toolName: "write", params: { file_path: filePath } },
    { warn: (...args: unknown[]) => warnings.push(args.join(" ")) }
  );

  assert.deepEqual(warnings, [
    "[Hook] ⚠️ Console.log detected in debug.ts",
    "[Hook] 💡 Consider removing or replacing with proper logging"
  ]);
  rmSync(root, { recursive: true, force: true });
});

test("console log audit ignores files without console.log", () => {
  const root = createTempProject();
  const filePath = join(root, "clean.ts");
  const warnings: string[] = [];
  writeFileSync(filePath, "export const value = 1;\n");

  runConsoleLogAudit(
    { toolName: "edit", params: { file_path: filePath } },
    { warn: (...args: unknown[]) => warnings.push(args.join(" ")) }
  );

  assert.deepEqual(warnings, []);
  rmSync(root, { recursive: true, force: true });
});

test("console log audit ignores unreadable files", () => {
  const root = createTempProject();
  const warnings: string[] = [];
  const missingPath = join(root, "missing.ts");

  runConsoleLogAudit(
    { toolName: "edit", params: { file_path: missingPath } },
    { warn: (...args: unknown[]) => warnings.push(args.join(" ")) }
  );

  assert.deepEqual(warnings, []);
  rmSync(root, { recursive: true, force: true });
});

test("quality gate runs tsc and eslint asynchronously", async () => {
  const root = createTempProject();
  const srcDir = join(root, "src");
  mkdirSync(srcDir, { recursive: true });
  const filePath = join(srcDir, "index.ts");
  const markerPath = join(root, "quality.log");
  writeFileSync(filePath, "export const value = 1;\n");
  writeFileSync(join(root, "tsconfig.json"), "{\"compilerOptions\":{\"target\":\"ES2022\"}}");
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
  scheduleQualityGate({ toolName: "edit", params: { file_path: filePath } }, {}, root);
  await new Promise(resolve => setTimeout(resolve, 300));
  const log = readFileSync(markerPath, "utf8");
  assert.match(log, /tsc/);
  assert.match(log, /eslint/);
  rmSync(root, { recursive: true, force: true });
});

test("plugin registers before_tool_call and after_tool_call handlers", () => {
  const hooks: string[] = [];
  plugin.register({
    logger: {},
    on(hookName) {
      hooks.push(hookName);
    }
  });
  assert.deepEqual(hooks.sort(), ["after_tool_call", "before_tool_call"]);
});

test("plugin loads config from file and inline config wins", () => {
  const root = mkdtempSync(join(tmpdir(), "openclaw-quality-hooks-config-"));
  const configFile = join(root, "quality.config.json");
  writeFileSync(configFile, JSON.stringify({ enabled: false, logDir: join(root, "from-file") }));

  const disabledHooks: string[] = [];
  plugin.register({
    pluginConfig: { configFile },
    logger: {},
    on(hookName) {
      disabledHooks.push(hookName);
    }
  });
  assert.deepEqual(disabledHooks, []);

  const enabledHooks: string[] = [];
  plugin.register({
    pluginConfig: { configFile, enabled: true },
    logger: {},
    on(hookName) {
      enabledHooks.push(hookName);
    }
  });
  assert.deepEqual(enabledHooks.sort(), ["after_tool_call", "before_tool_call"]);

  rmSync(root, { recursive: true, force: true });
});
