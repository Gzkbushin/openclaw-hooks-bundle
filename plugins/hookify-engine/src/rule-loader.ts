/**
 * hookify-engine — Rule Loader
 *
 * Discovers and loads rule definitions from `.md` files in a rules directory.
 * Each file uses YAML frontmatter (between `---` markers) to define rule metadata,
 * and the markdown body below the frontmatter becomes the rule's message.
 *
 * No external YAML parser is used — a lightweight inline parser handles the
 * subset of YAML needed (strings, booleans, numbers, arrays of objects).
 *
 * Default rules directory: `~/.openclaw/rules/`
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import type { Condition, ConditionOperator, EventFilter, Rule, RuleAction, Severity } from "./types.ts";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_RULES_DIR = "~/.openclaw/rules/";

/** Default values applied to rules when frontmatter fields are omitted */
const RULE_DEFAULTS = {
  enabled: true as const,
  action: "warn" as RuleAction,
  severity: "warning" as Severity,
  priority: 100,
} as const;

// ---------------------------------------------------------------------------
// Lightweight YAML Frontmatter Parser
// ---------------------------------------------------------------------------

/**
 * Strips the YAML frontmatter block from a markdown string and returns
 * the raw frontmatter text (without `---` delimiters) and the body.
 *
 * Returns `{ frontmatter, body }` when valid frontmatter is found, or
 * `{ frontmatter: null, body }` when the file doesn't start with `---`.
 */
function parseFrontmatter(raw: string): { frontmatter: string | null; body: string } {
  const trimmed = raw.replace(/^\uFEFF/, ""); // strip BOM

  if (!trimmed.startsWith("---")) {
    return { frontmatter: null, body: trimmed.trim() };
  }

  const firstClose = trimmed.indexOf("---", 3);
  if (firstClose === -1) {
    return { frontmatter: null, body: trimmed.trim() };
  }

  const frontmatter = trimmed.slice(3, firstClose).trim();
  const body = trimmed.slice(firstClose + 3).trim();
  return { frontmatter, body };
}

// ---------------------------------------------------------------------------
// Mini YAML Value Parser
// ---------------------------------------------------------------------------

/** Parse a single scalar YAML value (string, boolean, number) */
function parseYamlScalar(raw: string): string | boolean | number {
  const trimmed = raw.trim();

  // Boolean
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // Number (int or float)
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  // Quoted string — strip surrounding quotes
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // Bare string
  return trimmed;
}

/** Parse a YAML list of objects (the format used for `conditions`) */
function parseYamlListOfObjects(lines: string[]): Record<string, string | boolean | number>[] {
  const items: Record<string, string | boolean | number>[] = [];
  let current: Record<string, string | boolean | number> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // List item start: "- " followed by key-value on same line or next lines
    const itemMatch = trimmed.match(/^-\s+(\w+)\s*:\s*(.*)$/);
    if (itemMatch) {
      if (current) items.push(current);
      current = {};
      current[itemMatch[1]] = parseYamlScalar(itemMatch[2]);
      continue;
    }

    // Continuation key-value within the current list item
    const kvMatch = trimmed.match(/^\s+(\w+)\s*:\s*(.*)$/);
    if (kvMatch && current) {
      current[kvMatch[1]] = parseYamlScalar(kvMatch[2]);
      continue;
    }

    // List item start with nested object indicator "- key:" variant
    const bareDash = trimmed.match(/^-\s*$/);
    if (bareDash) {
      // The next line(s) will contain the key-values
      continue;
    }

    // Key-value after a bare dash (already inside an item)
    const subMatch = trimmed.match(/^(\w+)\s*:\s*(.*)$/);
    if (subMatch && current) {
      current[subMatch[1]] = parseYamlScalar(subMatch[2]);
    }
  }

  if (current) items.push(current);
  return items;
}

/**
 * Parse the frontmatter string into a flat key-value map.
 * Handles scalar values, lists of scalars, and lists of objects (for conditions).
 */
function parseFrontmatterYaml(frontmatter: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = frontmatter.split("\n");

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    const kvMatch = trimmed.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    const rawValue = kvMatch[2].trim();

    // List of objects — peek ahead to see if next lines are "- key: value" items.
    // This MUST be checked before the null-value check because `key:` with an empty
    // value is valid when followed by a YAML list on subsequent lines.
    if ((rawValue === "" || rawValue === "|" || rawValue === ">") && i + 1 < lines.length && /^\s*-\s/.test(lines[i + 1])) {
      const listLines: string[] = [];
      i++;
      while (i < lines.length && /^\s*-\s/.test(lines[i])) {
        listLines.push(lines[i]);
        i++;
        // Collect continuation lines (indented key: value)
        while (i < lines.length && /^\s{2,}\w/.test(lines[i]) && !/^\s*-\s/.test(lines[i])) {
          listLines.push("  " + lines[i].trim());
          i++;
        }
      }
      result[key] = parseYamlListOfObjects(listLines);
      continue;
    }

    // Null value (only when NOT followed by a list — that case is handled above)
    if (rawValue === "" || rawValue === "~" || rawValue === "null") {
      result[key] = null;
      i++;
      continue;
    }

    // Inline list: [item1, item2]
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      const inner = rawValue.slice(1, -1).trim();
      if (inner === "") {
        result[key] = [];
      } else {
        result[key] = inner.split(",").map((s) => parseYamlScalar(s.trim()));
      }
      i++;
      continue;
    }

    // Simple scalar
    result[key] = parseYamlScalar(rawValue);
    i++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Rule Validation & Default Application
// ---------------------------------------------------------------------------

/** Set of valid event filter values */
const VALID_EVENTS: Set<string> = new Set<EventFilter>([
  "before_tool_call",
  "after_tool_call",
  "session_start",
  "before_compaction",
  "all",
]);

/** Set of valid condition operators */
const VALID_OPERATORS: Set<string> = new Set<ConditionOperator>([
  "regex_match",
  "contains",
  "equals",
  "not_contains",
  "starts_with",
  "ends_with",
  "glob_match",
  "not_regex_match",
]);

/** Set of valid actions */
const VALID_ACTIONS: Set<string> = new Set<RuleAction>(["warn", "block", "log"]);

/** Set of valid severity levels */
const VALID_SEVERITIES: Set<string> = new Set<Severity>(["error", "warning", "info"]);

/** Map from event type to default condition field when using legacy `pattern` */
const LEGACY_PATTERN_FIELD: Record<string, string> = {
  before_tool_call: "command",
  after_tool_call: "new_text",
  session_start: "session_key",
  before_compaction: "context",
};

/**
 * Validate and normalise a parsed frontmatter object into a partial Rule.
 * Returns the validated partial rule, or throws on irrecoverable errors.
 */
function normaliseRule(
  data: Record<string, unknown>,
  message: string,
  source: string
): Rule | null {
  // Name is required
  const name = String(data.name ?? "").trim();
  if (!name) {
    return null; // skip rules without a name
  }

  // Enabled
  const enabledRaw = data.enabled;
  const enabled =
    enabledRaw === undefined
      ? RULE_DEFAULTS.enabled
      : enabledRaw === true || enabledRaw === "true";

  // Event
  const eventRaw = String(data.event ?? "before_tool_call").trim();
  let event: EventFilter = "before_tool_call";
  if (VALID_EVENTS.has(eventRaw)) {
    event = eventRaw as EventFilter;
  }

  // Action
  const actionRaw = String(data.action ?? RULE_DEFAULTS.action).trim();
  const action: RuleAction = VALID_ACTIONS.has(actionRaw)
    ? (actionRaw as RuleAction)
    : RULE_DEFAULTS.action;

  // Severity
  const severityRaw = String(data.severity ?? RULE_DEFAULTS.severity).trim();
  const severity: Severity = VALID_SEVERITIES.has(severityRaw)
    ? (severityRaw as Severity)
    : RULE_DEFAULTS.severity;

  // Priority
  const priorityRaw = data.priority;
  const priority =
    typeof priorityRaw === "number"
      ? priorityRaw
      : RULE_DEFAULTS.priority;

  // Conditions
  let conditions: Condition[] = [];

  if (Array.isArray(data.conditions) && data.conditions.length > 0) {
    for (const cond of data.conditions) {
      if (typeof cond !== "object" || cond === null) continue;
      const c = cond as Record<string, unknown>;

      const field = String(c.field ?? "").trim();
      const operator = String(c.operator ?? "").trim();
      const pattern = String(c.pattern ?? "").trim();

      if (!field || !operator || !pattern) continue;
      if (!VALID_OPERATORS.has(operator)) continue;

      conditions.push({ field, operator: operator as ConditionOperator, pattern });
    }
  } else if (typeof data.pattern === "string" && data.pattern.trim()) {
    // Legacy `pattern` field — auto-create a single condition
    const defaultField = LEGACY_PATTERN_FIELD[event] ?? "command";
    conditions.push({
      field: defaultField,
      operator: "regex_match",
      pattern: data.pattern.trim(),
    });
  }

  // A rule with no conditions after normalisation is not useful — skip it
  if (conditions.length === 0) {
    return null;
  }

  // Metadata — pass through any additional string key-value pairs
  const knownKeys = new Set([
    "name", "enabled", "event", "conditions", "pattern",
    "action", "severity", "priority",
  ]);
  const metadata: Record<string, string> | undefined = undefined;
  const metaEntries = Object.entries(data).filter(
    ([k, v]) => !knownKeys.has(k) && typeof v === "string"
  );
  const metadataObj: Record<string, string> | undefined =
    metaEntries.length > 0 ? Object.fromEntries(metaEntries) : undefined;

  return {
    name,
    enabled,
    event,
    conditions,
    action,
    severity,
    priority,
    message,
    source,
    metadata: metadataObj,
  };
}

// ---------------------------------------------------------------------------
// File Discovery
// ---------------------------------------------------------------------------

/** Cached file modification times for change detection */
const fileMtimeCache = new Map<string, number>();

/**
 * Recursively find all `.md` files under a directory.
 * Uses manual recursion (no external glob).
 */
function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];

  if (!existsSync(dir)) return results;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.endsWith(".md")) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Expand a `~`-prefixed path to the user's home directory.
 */
function expandHome(input: string): string {
  if (!input.startsWith("~")) return input;
  return join(process.env.HOME || "", input.slice(1));
}

// ---------------------------------------------------------------------------
// RuleLoader Class
// ---------------------------------------------------------------------------

/**
 * Loads and caches hookify rules from a directory of `.md` files.
 *
 * @example
 * ```ts
 * const loader = new RuleLoader();
 * const rules = loader.loadRules("before_tool_call");
 * ```
 */
// Module-level singleton for the convenience functions below
let defaultLoader: RuleLoader | null = null;

/**
 * Convenience function: load rules for a specific event using the default loader.
 * The default rules directory is `~/.openclaw/rules/` (or `globalThis.__hookifyEngineConfig?.rulesDir`).
 */
export function loadRules(event?: EventFilter): Rule[] {
  if (!defaultLoader) {
    const customDir = (globalThis as Record<string, unknown>)?.__hookifyEngineConfig
      ? ((globalThis as Record<string, unknown>).__hookifyEngineConfig as Record<string, unknown>).rulesDir as string | undefined
      : undefined;
    defaultLoader = new RuleLoader(customDir);
  }
  return defaultLoader.loadRules(event);
}

/**
 * Convenience function: force-reload all rules (clear caches).
 */
export function reloadAllRules(): Rule[] {
  if (!defaultLoader) {
    defaultLoader = new RuleLoader();
  }
  return defaultLoader.reloadRules();
}

export class RuleLoader {
  private rulesDir: string;
  private cachedRules: Rule[] | null = null;

  /**
   * @param rulesDir - Absolute or `~`-relative path to the rules directory.
   *                   Defaults to `~/.openclaw/rules/`.
   */
  constructor(rulesDir?: string) {
    this.rulesDir = expandHome(rulesDir ?? DEFAULT_RULES_DIR);
  }

  /**
   * Load all rules from the rules directory.
   * If `event` is provided, only rules whose `event` matches
   * (or is `'all'`) are returned.
   *
   * Results are cached by file modification time — subsequent calls
   * return cached rules unless files have changed.
   */
  loadRules(event?: EventFilter): Rule[] {
    const rules = this.loadAllRules();

    if (!event) return rules;

    return rules.filter((r) => r.enabled && (r.event === event || r.event === "all"));
  }

  /**
   * Load a single rule from a specific file path.
   * Returns `null` if the file doesn't exist or can't be parsed.
   */
  loadRuleFile(filePath: string): Rule | null {
    const resolved = resolve(filePath);
    if (!existsSync(resolved)) return null;

    return this.parseRuleFile(resolved);
  }

  /**
   * Force reload — clears all caches and re-reads every `.md` file.
   */
  reloadRules(): Rule[] {
    this.cachedRules = null;
    fileMtimeCache.clear();
    return this.loadAllRules();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Load and parse all `.md` files, with mtime-based caching */
  private loadAllRules(): Rule[] {
    const mdFiles = findMarkdownFiles(this.rulesDir);

    // Check if any file has changed since last load
    let changed = this.cachedRules === null;
    for (const filePath of mdFiles) {
      try {
        const stat = statSync(filePath);
        const cached = fileMtimeCache.get(filePath);
        if (cached === undefined || cached !== stat.mtimeMs) {
          changed = true;
          break;
        }
      } catch {
        // File disappeared — consider it a change
        changed = true;
        break;
      }
    }

    if (!changed) return this.cachedRules!;

    // Re-parse everything
    const rules: Rule[] = [];
    for (const filePath of mdFiles) {
      const rule = this.parseRuleFile(filePath);
      if (rule) {
        rules.push(rule);
        try {
          fileMtimeCache.set(filePath, statSync(filePath).mtimeMs);
        } catch {
          // ignore stat errors
        }
      }
    }

    this.cachedRules = rules;
    return rules;
  }

  /** Parse a single `.md` file into a Rule (or null) */
  private parseRuleFile(filePath: string): Rule | null {
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch {
      return null;
    }

    const { frontmatter, body } = parseFrontmatter(raw);
    if (frontmatter === null) return null; // no valid frontmatter

    const data = parseFrontmatterYaml(frontmatter);
    return normaliseRule(data, body, filePath);
  }
}
