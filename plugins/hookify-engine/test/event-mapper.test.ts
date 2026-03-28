import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  mapBeforeToolCallToInput,
  mapAfterToolCallToInput,
} from "../src/event-mapper.ts";

// ---------------------------------------------------------------------------
// mapBeforeToolCallToInput
// ---------------------------------------------------------------------------

describe("mapBeforeToolCallToInput", () => {
  test("maps basic exec tool event", () => {
    const result = mapBeforeToolCallToInput({
      toolName: "exec",
      params: { command: "rm -rf /tmp" },
    });

    assert.equal(result.hook_event_name, "before_tool_call");
    assert.equal(result.tool_name, "exec");
    assert.deepEqual(result.tool_input, { command: "rm -rf /tmp" });
  });

  test("normalizes tool name to lowercase", () => {
    const result = mapBeforeToolCallToInput({
      toolName: "Bash",
      params: { command: "ls" },
    });

    assert.equal(result.tool_name, "bash");
  });

  test("includes session context when provided", () => {
    const result = mapBeforeToolCallToInput(
      { toolName: "exec", params: { command: "test" } },
      { sessionId: "s1", sessionKey: "k1", runId: "r1" }
    );

    assert.equal(result.session_id, "s1");
    assert.equal(result.session_key, "k1");
    assert.equal(result.run_id, "r1");
  });

  test("omits context fields when not provided", () => {
    const result = mapBeforeToolCallToInput({
      toolName: "exec",
      params: { command: "test" },
    });

    assert.equal(result.session_id, undefined);
    assert.equal(result.session_key, undefined);
    assert.equal(result.run_id, undefined);
  });

  test("handles edit tool with file_path", () => {
    const result = mapBeforeToolCallToInput({
      toolName: "edit",
      params: { file_path: "/src/index.ts", new_string: "hello" },
    });

    assert.equal(result.tool_name, "edit");
    assert.equal(result.tool_input.file_path, "/src/index.ts");
    assert.equal(result.tool_input.new_string, "hello");
  });

  test("handles empty params gracefully", () => {
    const result = mapBeforeToolCallToInput({
      toolName: "exec",
      params: {},
    });

    assert.equal(result.tool_name, "exec");
    assert.deepEqual(result.tool_input, {});
  });

  test("handles missing toolName gracefully", () => {
    const result = mapBeforeToolCallToInput({
      toolName: "",
      params: { command: "test" },
    });

    assert.equal(result.tool_name, "");
  });
});

// ---------------------------------------------------------------------------
// mapAfterToolCallToInput
// ---------------------------------------------------------------------------

describe("mapAfterToolCallToInput", () => {
  test("maps basic after_tool_call event", () => {
    const result = mapAfterToolCallToInput({
      toolName: "edit",
      params: { file_path: "/src/app.ts" },
      result: "File updated",
    });

    assert.equal(result.hook_event_name, "after_tool_call");
    assert.equal(result.tool_name, "edit");
    assert.equal(result.tool_input.file_path, "/src/app.ts");
  });

  test("attaches error to tool_input", () => {
    const result = mapAfterToolCallToInput({
      toolName: "exec",
      params: { command: "false" },
      error: "Command failed with exit code 1",
    });

    assert.equal(result.tool_input.error, "Command failed with exit code 1");
  });

  test("attaches duration to tool_input", () => {
    const result = mapAfterToolCallToInput({
      toolName: "exec",
      params: { command: "npm test" },
      durationMs: 5000,
    });

    assert.equal(result.tool_input.duration_ms, 5000);
  });

  test("exposes string result as new_text", () => {
    const result = mapAfterToolCallToInput({
      toolName: "write",
      params: { file_path: "/src/log.ts" },
      result: 'console.log("hello");',
    });

    assert.equal(result.tool_input.new_text, 'console.log("hello");');
  });

  test("exposes object result fields", () => {
    const result = mapAfterToolCallToInput({
      toolName: "edit",
      params: {},
      result: { new_text: "updated content", content: "full content" },
    });

    assert.equal(result.tool_input.new_text, "updated content");
    assert.equal(result.tool_input.content, "full content");
  });

  test("includes session context", () => {
    const result = mapAfterToolCallToInput(
      { toolName: "exec", params: {}, result: "ok" },
      { sessionId: "s99" }
    );

    assert.equal(result.session_id, "s99");
  });

  test("handles missing result gracefully", () => {
    const result = mapAfterToolCallToInput({
      toolName: "exec",
      params: { command: "echo" },
    });

    assert.equal(result.tool_input.new_text, undefined);
  });

  test("does not overwrite existing tool_input fields", () => {
    const result = mapAfterToolCallToInput({
      toolName: "write",
      params: { file_path: "/test.txt", content: "original" },
      result: "replacement",
    });

    // result is a string, so new_text should be set, but existing content stays
    assert.equal(result.tool_input.file_path, "/test.txt");
    assert.equal(result.tool_input.content, "original");
    assert.equal(result.tool_input.new_text, "replacement");
  });
});
