import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("plugin entry imports shared helpers from the local module", () => {
  const entryPath = fileURLToPath(new URL("../index.ts", import.meta.url));
  const entrySource = readFileSync(entryPath, "utf8");

  assert.match(entrySource, /from "\.\/src\/shared\.ts"/);
  assert.doesNotMatch(
    entrySource,
    /\.\.\/openclaw-quality-hooks\/hooks\/shared\.ts/
  );
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

test("after_tool_call hook imports hook types from the local shared module", () => {
  const hookPath = fileURLToPath(new URL("../src/hooks/after-tool-call.ts", import.meta.url));
  const hookSource = readFileSync(hookPath, "utf8");

  assert.match(hookSource, /from "\.\.\/shared\.ts"/);
  assert.doesNotMatch(
    hookSource,
    /\.\.\/\.\.\/openclaw-quality-hooks\/hooks\/shared\.ts/
  );
});
