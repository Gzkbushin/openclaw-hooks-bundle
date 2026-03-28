/**
 * hookify-engine — Integration tests
 *
 * End-to-end tests that exercise the full pipeline:
 * rule file discovery → frontmatter parsing → event mapping → rule evaluation.
 */

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { RuleLoader } from "../src/rule-loader.ts";
import { evaluateRules, getStatistics, resetStatistics, clearRegexCache } from "../src/rule-engine.ts";
import {
  mapBeforeToolCallToInput,
  mapAfterToolCallToInput,
} from "../src/event-mapper.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "hookify-integ-"));
}

function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function writeRuleFile(dir: string, name: string, content: string): string {
  writeFileSync(join(dir, name), content, "utf8");
  return join(dir, name);
}

// Rule templates — note: in YAML double-quoted strings, \\ becomes \
const DANGEROUS_RM_RULE = `---
name: block-dangerous-rm
enabled: true
event: before_tool_call
priority: 900
severity: error
action: block
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "exec|bash|terminal"
  - field: command
    operator: regex_match
    pattern: "\\brm\\s+-[\\s\\S]*[rf][\\s\\S]*\\b"
---

🛑 Dangerous rm command detected!
`;

const GIT_PUSH_RULE = `---
name: check-git-push
enabled: true
event: before_tool_call
priority: 150
severity: warning
action: warn
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "exec|bash"
  - field: command
    operator: regex_match
    pattern: "^\\s*git\\s+push\\b"
---

📤 Verify changes before push.
`;

const DEBUG_CODE_RULE = `---
name: warn-debug-code
enabled: true
event: after_tool_call
priority: 200
severity: warning
action: warn
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "edit|write"
  - field: new_text
    operator: regex_match
    pattern: "console\\.log\\("
---

🐛 Debug code detected!
`;

const LOG_ONLY_RULE = `---
name: log-tool-usage
enabled: true
event: after_tool_call
priority: 50
severity: info
action: log
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "exec|bash"
  - field: command
    operator: contains
    pattern: "npm test"
---

📋 npm test executed.
`;

const DISABLED_RULE = `---
name: disabled-rule
enabled: false
event: before_tool_call
priority: 9999
severity: error
action: block
conditions:
  - field: tool_name
    operator: equals
    pattern: "anything"
---

This should never trigger.
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("hookify-engine integration", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
    resetStatistics();
    clearRegexCache();
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it("loads rules and blocks a before_tool_call event", () => {
    writeRuleFile(dir, "rm.md", DANGEROUS_RM_RULE);
    writeRuleFile(dir, "push.md", GIT_PUSH_RULE);
    writeRuleFile(dir, "disabled.md", DISABLED_RULE);

    const loader = new RuleLoader(dir);
    const rules = loader.loadRules("before_tool_call");

    // Should have 2 enabled rules (disabled excluded)
    assert.ok(rules.length >= 2, `Expected >=2 rules, got ${rules.length}`);

    const input = mapBeforeToolCallToInput(
      { toolName: "exec", params: { command: "rm -rf /tmp/test" } },
      { sessionId: "test-session", runId: "run-1" }
    );

    const result = evaluateRules(rules, input);
    assert.equal(result.blocked, true, "Should block rm -rf");
    assert.ok(result.blockReason, "Should have block reason");
    assert.ok(result.matchedRules.length > 0);
  });

  it("evaluates after_tool_call rules for warnings", () => {
    writeRuleFile(dir, "debug.md", DEBUG_CODE_RULE);
    writeRuleFile(dir, "log.md", LOG_ONLY_RULE);

    const loader = new RuleLoader(dir);
    const rules = loader.loadRules("after_tool_call");

    assert.ok(rules.length >= 1, "Should have after_tool_call rules");

    // Use new_string in params — rule engine falls back to new_string for new_text field
    const input = mapAfterToolCallToInput(
      {
        toolName: "edit",
        params: { file_path: "/src/index.ts", new_string: 'console.log("debug")' },
      },
      { sessionId: "test-session" }
    );

    const result = evaluateRules(rules, input);
    assert.ok(
      result.warnings.length > 0 || result.logs.length > 0,
      `Should have warnings or logs, got warnings=${result.warnings.length}, logs=${result.logs.length}`
    );
    assert.equal(result.blocked, false, "After-tool-call should never block");
  });

  it("does not trigger disabled rules", () => {
    writeRuleFile(dir, "disabled.md", DISABLED_RULE);

    const loader = new RuleLoader(dir);
    const rules = loader.loadRules("before_tool_call");

    const hasDisabled = rules.some((r) => r.name === "disabled-rule");
    assert.equal(hasDisabled, false, "Disabled rule should not be loaded");
  });

  it("handles empty rules directory gracefully", () => {
    const loader = new RuleLoader(dir);
    const rules = loader.loadRules("before_tool_call");
    assert.equal(rules.length, 0, "Empty directory should yield no rules");

    const input = mapBeforeToolCallToInput(
      { toolName: "exec", params: { command: "rm -rf /" } }
    );
    const result = evaluateRules(rules, input);
    assert.equal(result.blocked, false);
    assert.equal(result.warnings.length, 0);
  });

  it("filters rules by event type", () => {
    writeRuleFile(dir, "rm.md", DANGEROUS_RM_RULE);
    writeRuleFile(dir, "debug.md", DEBUG_CODE_RULE);

    const loader = new RuleLoader(dir);

    const beforeRules = loader.loadRules("before_tool_call");
    const afterRules = loader.loadRules("after_tool_call");

    assert.ok(beforeRules.some((r) => r.name === "block-dangerous-rm"));
    assert.ok(!beforeRules.some((r) => r.name === "warn-debug-code"));
    assert.ok(afterRules.some((r) => r.name === "warn-debug-code"));
    assert.ok(!afterRules.some((r) => r.name === "block-dangerous-rm"));
  });

  it("evaluates higher-priority block rules first", () => {
    writeRuleFile(dir, "rm.md", DANGEROUS_RM_RULE);
    writeRuleFile(dir, "push.md", GIT_PUSH_RULE);

    const loader = new RuleLoader(dir);
    const rules = loader.loadRules("before_tool_call");

    // git push matches check-git-push but NOT block-dangerous-rm
    const input = mapBeforeToolCallToInput(
      { toolName: "exec", params: { command: "git push" } }
    );

    const result = evaluateRules(rules, input);
    assert.equal(result.blocked, false, "git push should not be blocked");
    assert.ok(result.warnings.length > 0, "git push should produce warning");
  });

  it("tracks rule hit statistics", () => {
    writeRuleFile(dir, "rm.md", DANGEROUS_RM_RULE);

    const loader = new RuleLoader(dir);
    const rules = loader.loadRules("before_tool_call");

    const input = mapBeforeToolCallToInput(
      { toolName: "exec", params: { command: "rm -rf /tmp" } }
    );

    evaluateRules(rules, input);
    evaluateRules(rules, input);

    const stats = getStatistics();
    const rmStat = stats.find((s) => s.ruleName === "block-dangerous-rm");
    assert.ok(rmStat, "Should find block-dangerous-rm statistic");
    assert.equal(rmStat!.hitCount, 2, "Hit count should be 2");
  });

  it("picks up new rule files on reload", () => {
    const loader = new RuleLoader(dir);

    let rules = loader.loadRules("before_tool_call");
    assert.equal(rules.length, 0);

    writeRuleFile(dir, "new.md", DANGEROUS_RM_RULE);
    rules = loader.reloadRules();
    assert.ok(rules.length > 0, "Should pick up new rule after reload");
  });

  it("blocks rm -rf with correct result structure", () => {
    writeRuleFile(dir, "rm.md", DANGEROUS_RM_RULE);

    const loader = new RuleLoader(dir);
    const rules = loader.loadRules("before_tool_call");

    const input = mapBeforeToolCallToInput(
      { toolName: "Bash", params: { command: "rm -rf /important/stuff" } },
      { sessionId: "s1", runId: "r1" }
    );

    const result = evaluateRules(rules, input);

    assert.equal(result.blocked, true);
    assert.ok(result.blockReason);
    assert.equal(result.matchedRules.length, 1);
    assert.equal(result.matchedRules[0].rule.name, "block-dangerous-rm");
    assert.ok(result.matchedRules[0].matchedConditions.length >= 2);
  });

  it("warns about debug code in after_tool_call", () => {
    writeRuleFile(dir, "debug.md", DEBUG_CODE_RULE);

    const loader = new RuleLoader(dir);
    const rules = loader.loadRules("after_tool_call");

    const input = mapAfterToolCallToInput(
      {
        toolName: "write",
        params: { file_path: "/src/app.ts", new_string: 'console.log("hello")' },
      },
      { sessionId: "s2" }
    );

    const result = evaluateRules(rules, input);
    assert.equal(result.blocked, false);
    assert.ok(result.warnings.length > 0, "Should warn about debug code");
  });
});
