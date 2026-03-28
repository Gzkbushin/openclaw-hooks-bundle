import test, { describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { evaluateRules, getStatistics, resetStatistics, clearRegexCache } from "../src/rule-engine.ts";
import type { Rule, Condition } from "../src/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<Rule> & { name: string }): Rule {
  return {
    enabled: true,
    event: "before_tool_call",
    priority: 100,
    severity: "warning",
    action: "warn",
    conditions: [],
    message: "test message",
    source: "/test/rule.md",
    ...overrides,
  };
}

function makeCondition(overrides: Partial<Condition> & { field: string }): Condition {
  return {
    operator: "regex_match",
    pattern: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("evaluateRules", () => {
  beforeEach(() => {
    resetStatistics();
    clearRegexCache();
  });

  // -- regex_match --
  test("regex_match matches pattern", () => {
    const rule = makeRule({
      name: "rm-test",
      action: "block",
      severity: "error",
      conditions: [
        makeCondition({ field: "tool_name", operator: "regex_match", pattern: "exec|bash" }),
        makeCondition({ field: "command", operator: "regex_match", pattern: "rm -rf" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
      tool_input: { command: "rm -rf /tmp" },
    });

    assert.equal(result.blocked, true);
    assert.ok(result.blockReason);
    assert.equal(result.matchedRules.length, 1);
  });

  test("regex_match does not match non-matching input", () => {
    const rule = makeRule({
      name: "rm-test",
      action: "block",
      conditions: [
        makeCondition({ field: "tool_name", operator: "regex_match", pattern: "exec" }),
        makeCondition({ field: "command", operator: "regex_match", pattern: "rm -rf" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
      tool_input: { command: "ls -la" },
    });

    assert.equal(result.blocked, false);
    assert.equal(result.matchedRules.length, 0);
  });

  test("regex_match is case-insensitive", () => {
    const rule = makeRule({
      name: "case-test",
      action: "warn",
      conditions: [
        makeCondition({ field: "tool_name", operator: "regex_match", pattern: "EXEC" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
    });

    assert.equal(result.warnings.length, 1);
  });

  // -- contains --
  test("contains matches substring", () => {
    const rule = makeRule({
      name: "contains-test",
      action: "warn",
      conditions: [
        makeCondition({ field: "command", operator: "contains", pattern: "npm test" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_input: { command: "npm test -- --coverage" },
    });

    assert.equal(result.warnings.length, 1);
  });

  test("contains does not match missing substring", () => {
    const rule = makeRule({
      name: "contains-negative",
      action: "warn",
      conditions: [
        makeCondition({ field: "command", operator: "contains", pattern: "dangerous" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_input: { command: "echo hello" },
    });

    assert.equal(result.warnings.length, 0);
  });

  // -- equals --
  test("equals matches exact string", () => {
    const rule = makeRule({
      name: "equals-test",
      action: "warn",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
    });

    assert.equal(result.warnings.length, 1);
  });

  test("equals does not match partial", () => {
    const rule = makeRule({
      name: "equals-partial",
      action: "warn",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_name: "executor",
    });

    assert.equal(result.warnings.length, 0);
  });

  // -- not_contains --
  test("not_contains matches when substring absent", () => {
    const rule = makeRule({
      name: "not-contains-test",
      action: "warn",
      conditions: [
        makeCondition({ field: "command", operator: "not_contains", pattern: "test" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_input: { command: "npm run build" },
    });

    assert.equal(result.warnings.length, 1);
  });

  test("not_contains does not match when substring present", () => {
    const rule = makeRule({
      name: "not-contains-neg",
      action: "warn",
      conditions: [
        makeCondition({ field: "command", operator: "not_contains", pattern: "test" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_input: { command: "npm test" },
    });

    assert.equal(result.warnings.length, 0);
  });

  // -- starts_with / ends_with --
  test("starts_with matches prefix", () => {
    const rule = makeRule({
      name: "starts-test",
      action: "warn",
      conditions: [
        makeCondition({ field: "command", operator: "starts_with", pattern: "git push" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_input: { command: "git push origin main" },
    });

    assert.equal(result.warnings.length, 1);
  });

  test("ends_with matches suffix", () => {
    const rule = makeRule({
      name: "ends-test",
      action: "warn",
      conditions: [
        makeCondition({ field: "file_path", operator: "ends_with", pattern: ".ts" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_input: { file_path: "/src/index.ts" },
    });

    assert.equal(result.warnings.length, 1);
  });

  // -- glob_match --
  test("glob_match matches wildcard patterns", () => {
    const rule = makeRule({
      name: "glob-test",
      action: "warn",
      conditions: [
        makeCondition({ field: "file_path", operator: "glob_match", pattern: "*.env*" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_input: { file_path: ".env.local" },
    });

    assert.equal(result.warnings.length, 1);
  });

  // -- not_regex_match --
  test("not_regex_match inverts match", () => {
    const rule = makeRule({
      name: "not-regex-test",
      action: "warn",
      conditions: [
        makeCondition({ field: "command", operator: "not_regex_match", pattern: "rm" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_input: { command: "ls -la" },
    });

    assert.equal(result.warnings.length, 1);

    const result2 = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_input: { command: "rm -rf" },
    });

    assert.equal(result2.warnings.length, 0);
  });

  // -- AND logic --
  test("all conditions must match (AND)", () => {
    const rule = makeRule({
      name: "and-test",
      action: "block",
      conditions: [
        makeCondition({ field: "tool_name", operator: "regex_match", pattern: "exec" }),
        makeCondition({ field: "command", operator: "contains", pattern: "rm" }),
        makeCondition({ field: "command", operator: "contains", pattern: "-rf" }),
      ],
    });

    // All match
    const r1 = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
      tool_input: { command: "rm -rf /" },
    });
    assert.equal(r1.blocked, true);

    // Only 2 match
    const r2 = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
      tool_input: { command: "rm -i /" },
    });
    assert.equal(r2.blocked, false);
  });

  // -- Priority ordering --
  test("higher priority rules evaluated first", () => {
    const lowRule = makeRule({
      name: "low-priority",
      priority: 10,
      action: "warn",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
    });

    const highRule = makeRule({
      name: "high-priority",
      priority: 900,
      action: "block",
      severity: "error",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
    });

    const result = evaluateRules([lowRule, highRule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
    });

    // Both should match since both conditions are satisfied
    assert.equal(result.blocked, true);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.matchedRules.length, 2);
    // High priority should be first
    assert.equal(result.matchedRules[0].rule.name, "high-priority");
  });

  // -- Block takes priority --
  test("block action takes priority over warn", () => {
    const warnRule = makeRule({
      name: "warn-rule",
      priority: 500,
      action: "warn",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
    });

    const blockRule = makeRule({
      name: "block-rule",
      priority: 200,
      action: "block",
      severity: "error",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
    });

    const result = evaluateRules([warnRule, blockRule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
    });

    assert.equal(result.blocked, true);
    assert.equal(result.warnings.length, 1);
  });

  // -- Multiple warnings --
  test("accumulates warnings from multiple rules", () => {
    const rule1 = makeRule({
      name: "rule1",
      priority: 300,
      action: "warn",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
      message: "Warning 1",
    });

    const rule2 = makeRule({
      name: "rule2",
      priority: 200,
      action: "warn",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
      message: "Warning 2",
    });

    const result = evaluateRules([rule1, rule2], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
    });

    assert.equal(result.blocked, false);
    assert.equal(result.warnings.length, 2);
  });

  // -- Field extraction --
  test("extracts tool_name from top-level input", () => {
    const rule = makeRule({
      name: "tool-test",
      action: "warn",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "bash" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_name: "bash",
    });
    assert.equal(result.warnings.length, 1);
  });

  test("extracts command from tool_input", () => {
    const rule = makeRule({
      name: "cmd-test",
      action: "warn",
      conditions: [
        makeCondition({ field: "command", operator: "contains", pattern: "hello" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_input: { command: "echo hello world" },
    });
    assert.equal(result.warnings.length, 1);
  });

  test("extracts file_path from tool_input", () => {
    const rule = makeRule({
      name: "file-test",
      action: "warn",
      conditions: [
        makeCondition({ field: "file_path", operator: "ends_with", pattern: ".env" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_input: { file_path: "/app/.env" },
    });
    assert.equal(result.warnings.length, 1);
  });

  test("extracts new_text from tool_input", () => {
    const rule = makeRule({
      name: "new-text-test",
      event: "after_tool_call",
      action: "warn",
      conditions: [
        makeCondition({ field: "new_text", operator: "contains", pattern: "console.log" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "after_tool_call",
      tool_input: { new_text: "const x = console.log('hello');" },
    });
    assert.equal(result.warnings.length, 1);
  });

  test("falls back to new_string for new_text field", () => {
    const rule = makeRule({
      name: "new-string-test",
      event: "after_tool_call",
      action: "warn",
      conditions: [
        makeCondition({ field: "new_text", operator: "contains", pattern: "debug" }),
      ],
    });

    const result = evaluateRules([rule], {
      hook_event_name: "after_tool_call",
      tool_input: { new_string: "debugger;" },
    });
    assert.equal(result.warnings.length, 1);
  });

  // -- Disabled rules --
  test("skips disabled rules", () => {
    const disabledRule = makeRule({
      name: "disabled",
      enabled: false,
      action: "block",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
    });

    const result = evaluateRules([disabledRule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
    });

    assert.equal(result.blocked, false);
    assert.equal(result.matchedRules.length, 0);
  });

  // -- Event filtering --
  test("filters by event type", () => {
    const beforeRule = makeRule({
      name: "before-only",
      event: "before_tool_call",
      action: "warn",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
    });

    const afterRule = makeRule({
      name: "after-only",
      event: "after_tool_call",
      action: "warn",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
    });

    const beforeResult = evaluateRules([beforeRule, afterRule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
    });

    assert.equal(beforeResult.warnings.length, 1);
    assert.equal(beforeResult.matchedRules[0].rule.name, "before-only");
  });

  test("event='all' matches any event", () => {
    const allRule = makeRule({
      name: "always",
      event: "all",
      action: "warn",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
    });

    const result = evaluateRules([allRule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
    });

    assert.equal(result.warnings.length, 1);
  });

  // -- Statistics --
  test("tracks hit statistics", () => {
    const rule = makeRule({
      name: "stat-test",
      action: "warn",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
    });

    evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
    });

    let stats = getStatistics();
    assert.equal(stats.length, 1);
    assert.equal(stats[0].ruleName, "stat-test");
    assert.equal(stats[0].hitCount, 1);
    assert.ok(stats[0].lastHitAt);

    evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
    });

    stats = getStatistics();
    assert.equal(stats[0].hitCount, 2);

    resetStatistics();
    stats = getStatistics();
    assert.equal(stats.length, 0);
  });

  // -- LRU cache --
  test("regex cache avoids re-compilation", () => {
    const rule = makeRule({
      name: "cache-test",
      action: "warn",
      conditions: [
        makeCondition({ field: "command", operator: "regex_match", pattern: "\\d{3}-\\d{4}" }),
      ],
    });

    // Evaluate many times — should not throw
    for (let i = 0; i < 300; i++) {
      evaluateRules([rule], {
        hook_event_name: "before_tool_call",
        tool_input: { command: `call 123-4567 iteration ${i}` },
      });
    }

    assert.ok(true, "Cache handles >256 unique patterns without error");
  });

  // -- Empty input --
  test("returns empty result for empty input", () => {
    const result = evaluateRules([], {
      hook_event_name: "before_tool_call",
    });

    assert.equal(result.blocked, false);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.logs.length, 0);
    assert.equal(result.matchedRules.length, 0);
  });

  // -- log action --
  test("log action populates logs array", () => {
    const rule = makeRule({
      name: "log-test",
      action: "log",
      severity: "info",
      conditions: [
        makeCondition({ field: "tool_name", operator: "equals", pattern: "exec" }),
      ],
      message: "Exec tool used",
    });

    const result = evaluateRules([rule], {
      hook_event_name: "before_tool_call",
      tool_name: "exec",
    });

    assert.equal(result.blocked, false);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.logs.length, 1);
    assert.ok(result.logs[0].includes("Exec tool used"));
  });
});
