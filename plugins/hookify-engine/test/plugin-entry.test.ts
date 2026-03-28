import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("plugin entry imports shared helpers from the local module", () => {
  const entryPath = fileURLToPath(new URL("../index.ts", import.meta.url));
  const entrySource = readFileSync(entryPath, "utf8");

  assert.match(entrySource, /from "\.\/src\/shared\.ts"/);
  assert.match(entrySource, /\bon:\s*\(event: string, handler: HookHandler, options\?: \{ priority\?: number \}\) => void/);
  assert.match(entrySource, /api\.on\(\s*"before_tool_call"/);
  assert.match(entrySource, /api\.on\(\s*"after_tool_call"/);
  assert.doesNotMatch(
    entrySource,
    /\.\.\/openclaw-quality-hooks\/hooks\/shared\.ts/
  );
  assert.doesNotMatch(entrySource, /definePluginEntry/);
  assert.doesNotMatch(entrySource, /await import\(/);
  assert.doesNotMatch(entrySource, /createRequire/);
});

test("before_tool_call hook imports hook types from the local shared module", () => {
  const hookPath = fileURLToPath(new URL("../src/hooks/before-tool-call.ts", import.meta.url));
  const hookSource = readFileSync(hookPath, "utf8");

  assert.match(hookSource, /from "\.\.\/shared\.ts"/);
  assert.doesNotMatch(
    hookSource,
    /\.\.\/\.\.\/openclaw-quality-hooks\/hooks\/shared\.ts/
  );
});

test("plugin entry exports the plain plugin object", () => {
  const entryPath = fileURLToPath(new URL("../index.ts", import.meta.url));
  const entrySource = readFileSync(entryPath, "utf8");

  assert.match(entrySource, /const plugin = \{/);
  assert.match(entrySource, /export \{ plugin \};/);
  assert.match(entrySource, /export default plugin;/);
});

test("after_tool_call hook imports hook types from the local shared module", () => {
  const hookPath = fileURLToPath(new URL("../src/hooks/after-tool-call.ts", import.meta.url));
  const hookSource = readFileSync(hookPath, "utf8");

  assert.match(hookSource, /from "\.\.\/shared\.ts"/);
  assert.doesNotMatch(
    hookSource,
    /\.\.\/\.\.\/openclaw-quality-hooks\/hooks\/shared\.ts/
  );
});
