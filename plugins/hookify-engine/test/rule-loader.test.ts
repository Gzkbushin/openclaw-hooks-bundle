import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RuleLoader } from "../src/rule-loader.ts";
import type { Rule, Condition } from "../src/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "hookify-rule-loader-"));
}

function writeRuleFile(dir: string, name: string, content: string): string {
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, name);
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

function validRule(name = "test-rule", extra = ""): string {
  return `---
name: ${name}
enabled: true
event: before_tool_call
priority: 100
severity: warning
action: warn
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "exec"
${extra}
---

Test rule message for ${name}.
`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RuleLoader", () => {
  test("loads a valid .md rule file", () => {
    tempDir = makeTempDir();
    writeRuleFile(tempDir, "test.md", validRule());

    const loader = new RuleLoader(tempDir);
    const rules = loader.loadRules();
    assert.equal(rules.length, 1);
    assert.equal(rules[0].name, "test-rule");
    assert.equal(rules[0].enabled, true);
    assert.equal(rules[0].action, "warn");
    assert.equal(rules[0].severity, "warning");
    assert.equal(rules[0].priority, 100);
    assert.equal(rules[0].message.trim(), "Test rule message for test-rule.");
  });

  test("parses frontmatter fields correctly", () => {
    tempDir = makeTempDir();
    writeRuleFile(tempDir, "block.md", `---
name: my-block
enabled: true
event: before_tool_call
priority: 500
severity: error
action: block
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "bash"
  - field: command
    operator: regex_match
    pattern: "rm -rf"
---

Blocked!
`);

    const loader = new RuleLoader(tempDir);
    const rules = loader.loadRules();
    assert.equal(rules.length, 1);

    const r = rules[0];
    assert.equal(r.name, "my-block");
    assert.equal(r.severity, "error");
    assert.equal(r.action, "block");
    assert.equal(r.priority, 500);
    assert.equal(r.conditions.length, 2);
    assert.equal(r.conditions[0].field, "tool_name");
    assert.equal(r.conditions[0].operator, "regex_match");
    assert.equal(r.conditions[0].pattern, "bash");
    assert.equal(r.conditions[1].field, "command");
    assert.equal(r.conditions[1].pattern, "rm -rf");
  });

  test("applies default values for missing fields", () => {
    tempDir = makeTempDir();
    writeRuleFile(tempDir, "minimal.md", `---
name: minimal
conditions:
  - field: command
    operator: contains
    pattern: "test"
---

Minimal rule.
`);

    const loader = new RuleLoader(tempDir);
    const rules = loader.loadRules();

    assert.equal(rules.length, 1);
    const r = rules[0];
    assert.equal(r.enabled, true);
    assert.equal(r.action, "warn");
    assert.equal(r.severity, "warning");
    assert.equal(r.priority, 100);
    assert.equal(r.event, "before_tool_call");
  });

  test("converts legacy pattern field to a condition", () => {
    tempDir = makeTempDir();
    writeRuleFile(tempDir, "legacy.md", `---
name: legacy
event: before_tool_call
pattern: "chmod 777"
action: block
severity: error
---

Legacy pattern rule.
`);

    const loader = new RuleLoader(tempDir);
    const rules = loader.loadRules();

    assert.equal(rules.length, 1);
    const r = rules[0];
    assert.equal(r.conditions.length, 1);
    assert.equal(r.conditions[0].field, "command");
    assert.equal(r.conditions[0].operator, "regex_match");
    assert.equal(r.conditions[0].pattern, "chmod 777");
  });

  test("skips files without frontmatter", () => {
    tempDir = makeTempDir();
    writeRuleFile(tempDir, "no-frontmatter.md", "# Just a regular markdown file\n\nNo frontmatter here.");

    const loader = new RuleLoader(tempDir);
    const rules = loader.loadRules();
    assert.equal(rules.length, 0);
  });

  test("skips files with missing name", () => {
    tempDir = makeTempDir();
    writeRuleFile(tempDir, "no-name.md", `---
enabled: true
event: before_tool_call
conditions:
  - field: command
    operator: contains
    pattern: "test"
---

No name rule.
`);

    const loader = new RuleLoader(tempDir);
    const rules = loader.loadRules();
    assert.equal(rules.length, 0);
  });

  test("skips rules with no conditions", () => {
    tempDir = makeTempDir();
    writeRuleFile(tempDir, "no-conditions.md", `---
name: no-conditions
enabled: true
---

No conditions.
`);

    const loader = new RuleLoader(tempDir);
    const rules = loader.loadRules();
    assert.equal(rules.length, 0);
  });

  test("filters by event type", () => {
    tempDir = makeTempDir();
    writeRuleFile(tempDir, "before.md", validRule("before-rule"));
    writeRuleFile(tempDir, "after.md", `---
name: after-rule
enabled: true
event: after_tool_call
priority: 100
severity: warning
action: warn
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "edit"
---

After rule.
`);

    const loader = new RuleLoader(tempDir);

    const beforeRules = loader.loadRules("before_tool_call");
    assert.equal(beforeRules.length, 1);
    assert.equal(beforeRules[0].name, "before-rule");

    const afterRules = loader.loadRules("after_tool_call");
    assert.equal(afterRules.length, 1);
    assert.equal(afterRules[0].name, "after-rule");

    const allRules = loader.loadRules();
    assert.equal(allRules.length, 2);
  });

  test("handles multiple conditions", () => {
    tempDir = makeTempDir();
    writeRuleFile(tempDir, "multi.md", `---
name: multi-condition
enabled: true
event: before_tool_call
priority: 100
severity: warning
action: warn
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "exec"
  - field: command
    operator: regex_match
    pattern: "npm"
  - field: command
    operator: contains
    pattern: "test"
---

Multi condition rule.
`);

    const loader = new RuleLoader(tempDir);
    const rules = loader.loadRules();

    assert.equal(rules.length, 1);
    assert.equal(rules[0].conditions.length, 3);
  });

  test("loadRuleFile loads a single file", () => {
    tempDir = makeTempDir();
    const filePath = writeRuleFile(tempDir, "single.md", validRule("single-rule"));

    const loader = new RuleLoader(tempDir);
    const rule = loader.loadRuleFile(filePath);

    assert.ok(rule);
    assert.equal(rule!.name, "single-rule");
  });

  test("loadRuleFile returns null for non-existent file", () => {
    const loader = new RuleLoader("/non/existent/path");
    const rule = loader.loadRuleFile("/non/existent/rule.md");
    assert.equal(rule, null);
  });

  test("reloadRules clears cache and re-reads files", () => {
    tempDir = makeTempDir();

    const loader = new RuleLoader(tempDir);
    assert.equal(loader.loadRules().length, 0);

    writeRuleFile(tempDir, "new.md", validRule("new-rule"));
    const reloaded = loader.reloadRules();
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0].name, "new-rule");
  });

  test("records source file path", () => {
    tempDir = makeTempDir();
    const filePath = writeRuleFile(tempDir, "sourced.md", validRule("sourced-rule"));

    const loader = new RuleLoader(tempDir);
    const rules = loader.loadRules();
    assert.equal(rules[0].source, filePath);
  });
});
