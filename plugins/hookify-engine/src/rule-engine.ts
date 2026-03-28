/**
 * hookify-engine — Rule Evaluation Engine
 *
 * Evaluates loaded rules against event input, applying conditions with AND logic,
 * sorting by priority, and producing structured results (blocked / warnings / logs).
 *
 * Includes an LRU cache for compiled regexes and per-rule hit statistics.
 */

import type {
  Condition,
  ConditionOperator,
  Rule,
  RuleEngineResult,
  RuleMatchResult,
  RuleStatistics,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Regex LRU Cache (max 256 entries)
// ---------------------------------------------------------------------------

const REGEX_CACHE_MAX = 256;

/**
 * Simple LRU cache for compiled RegExp objects.
 * Key format: `${pattern}::${flags}`.
 */
class RegexLRUCache {
  private cache = new Map<string, RegExp>();

  get(pattern: string, flags: string): RegExp | undefined {
    const key = `${pattern}::${flags}`;
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  set(pattern: string, flags: string, regex: RegExp): void {
    const key = `${pattern}::${flags}`;
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, regex);

    // Evict least-recently-used if over capacity
    while (this.cache.size > REGEX_CACHE_MAX) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

const regexCache = new RegexLRUCache();

/**
 * Compile a regex pattern (case-insensitive), using the LRU cache.
 * Returns `null` if the pattern is an invalid regex.
 */
function compileRegex(pattern: string): RegExp | null {
  const flags = "i";
  const cached = regexCache.get(pattern, flags);
  if (cached) return cached;

  try {
    const regex = new RegExp(pattern, flags);
    regexCache.set(pattern, flags, regex);
    return regex;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Condition Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a single condition against a string value.
 * Returns `true` if the condition is satisfied.
 */
function evaluateConditionOperator(
  operator: ConditionOperator,
  value: string,
  pattern: string
): boolean {
  switch (operator) {
    case "regex_match": {
      const regex = compileRegex(pattern);
      if (!regex) return false;
      return regex.test(value);
    }
    case "not_regex_match": {
      const regex = compileRegex(pattern);
      if (!regex) return true; // invalid regex → don't match
      return !regex.test(value);
    }
    case "contains":
      return value.includes(pattern);
    case "not_contains":
      return !value.includes(pattern);
    case "equals":
      return value === pattern;
    case "starts_with":
      return value.startsWith(pattern);
    case "ends_with":
      return value.endsWith(pattern);
    case "glob_match": {
      const regexStr = globToRegex(pattern);
      const regex = compileRegex(regexStr);
      if (!regex) return false;
      return regex.test(value);
    }
    default:
      return false;
  }
}

/**
 * Convert a glob pattern to a regex string suitable for `new RegExp()`.
 * - `*` → `.*`
 * - `?` → `.`
 * - Escape all other regex-special characters
 */
function globToRegex(glob: string): string {
  let result = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      result += ".*";
    } else if (ch === "?") {
      result += ".";
    } else if (".+^${}()|[]\\".includes(ch)) {
      result += "\\" + ch;
    } else {
      result += ch;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Field Extraction
// ---------------------------------------------------------------------------

/**
 * Extract a field value from the event input.
 *
 * Lookup order:
 * 1. Special top-level fields: `tool_name`, `hook_event_name`, `session_id`, `session_key`, `run_id`
 * 2. Fields within `input.tool_input` (e.g. `command`, `file_path`, `content`)
 * 3. Direct top-level field on input
 *
 * For `after_tool_call` events, `new_text` also checks `tool_input.new_string`.
 *
 * Returns the string value, or `null` if the field is not found.
 */
function extractField(
  field: string,
  input: Record<string, unknown>
): string | null {
  // Special top-level fields
  if (field === "tool_name") {
    const v = input.tool_name ?? input.toolName;
    return typeof v === "string" ? v : null;
  }
  if (field === "hook_event_name") {
    const v = input.hook_event_name ?? input.event;
    return typeof v === "string" ? v : null;
  }
  if (field === "session_id") {
    const v = input.session_id ?? input.sessionId;
    return typeof v === "string" ? v : null;
  }
  if (field === "session_key") {
    const v = input.session_key ?? input.sessionKey;
    return typeof v === "string" ? v : null;
  }
  if (field === "run_id") {
    const v = input.run_id ?? input.runId;
    return typeof v === "string" ? v : null;
  }
  if (field === "error") {
    const v = input.error;
    return typeof v === "string" ? v : null;
  }
  if (field === "duration_ms") {
    const v = input.duration_ms ?? input.durationMs;
    return v !== undefined ? String(v) : null;
  }

  // Look in tool_input
  const toolInput = input.tool_input as Record<string, unknown> | undefined;
  if (toolInput && typeof toolInput === "object") {
    const direct = toolInput[field];
    if (typeof direct === "string") return direct;

    // Special: new_text also checks new_string (Claude Code uses new_string)
    if (field === "new_text") {
      const alt = toolInput.new_string;
      if (typeof alt === "string") return alt;
    }
    if (field === "old_text") {
      const alt = toolInput.old_string;
      if (typeof alt === "string") return alt;
    }
  }

  // Direct top-level field
  const topValue = input[field];
  if (typeof topValue === "string") return topValue;

  return null;
}

// ---------------------------------------------------------------------------
// Rule Statistics
// ---------------------------------------------------------------------------

/** In-memory hit statistics keyed by rule name */
const statistics = new Map<string, RuleStatistics>();

function recordHit(ruleName: string, pattern: string | null): void {
  const now = new Date().toISOString();
  const existing = statistics.get(ruleName);
  if (existing) {
    existing.hitCount++;
    existing.lastHitAt = now;
    existing.lastMatchedPattern = pattern;
  } else {
    statistics.set(ruleName, {
      ruleName,
      hitCount: 1,
      lastHitAt: now,
      lastMatchedPattern: pattern,
    });
  }
}

// ---------------------------------------------------------------------------
// RuleEngine
// ---------------------------------------------------------------------------

/**
 * Evaluate a set of rules against an event input.
 *
 * @param rules - Array of rules to evaluate
 * @param input - Event input data (must contain `hook_event_name` for event filtering,
 *               plus relevant fields like `tool_input`, `tool_name`, etc.)
 * @returns Structured result with blocked status, warnings, logs, and match details
 *
 * @example
 * ```ts
 * const result = evaluateRules(rules, {
 *   hook_event_name: "before_tool_call",
 *   tool_name: "exec",
 *   tool_input: { command: "rm -rf /" },
 * });
 * ```
 */
export function evaluateRules(
  rules: Rule[],
  input: Record<string, unknown>
): RuleEngineResult {
  const result: RuleEngineResult = {
    blocked: false,
    warnings: [],
    blockReason: undefined,
    logs: [],
    matchedRules: [],
  };

  // Determine the event from input
  const eventName = String(input.hook_event_name ?? input.event ?? "before_tool_call");

  // Filter to enabled rules matching this event
  const applicableRules = rules.filter(
    (r) => r.enabled && (r.event === eventName || r.event === "all")
  );

  // Sort by priority descending (highest priority first)
  applicableRules.sort((a, b) => b.priority - a.priority);

  for (const rule of applicableRules) {
    const matchedConditions: Condition[] = [];

    // All conditions must match (AND logic)
    let allMatch = true;
    for (const condition of rule.conditions) {
      const value = extractField(condition.field, input);
      if (value === null) {
        allMatch = false;
        break;
      }

      const satisfied = evaluateConditionOperator(
        condition.operator,
        value,
        condition.pattern
      );
      if (satisfied) {
        matchedConditions.push(condition);
      } else {
        allMatch = false;
        break;
      }
    }

    if (!allMatch) continue;

    // Rule matched
    const matchResult: RuleMatchResult = { rule, matchedConditions };
    result.matchedRules.push(matchResult);

    // Record statistics
    const lastPattern = matchedConditions[matchedConditions.length - 1]?.pattern ?? null;
    recordHit(rule.name, lastPattern);

    // Apply action
    const message = rule.message
      ? `[${rule.severity.toUpperCase()}] ${rule.name}: ${rule.message}`
      : `[${rule.severity.toUpperCase()}] ${rule.name}`;

    switch (rule.action) {
      case "block":
        result.blocked = true;
        result.blockReason = rule.message || `Blocked by rule: ${rule.name}`;
        // Don't return early — keep evaluating to accumulate all matches
        break;
      case "warn":
        result.warnings.push(message);
        break;
      case "log":
        result.logs.push(message);
        break;
    }
  }

  return result;
}

/**
 * Get accumulated hit statistics for all rules that have matched so far.
 *
 * @returns Array of statistics sorted by hit count descending
 */
export function getStatistics(): RuleStatistics[] {
  return Array.from(statistics.values()).sort((a, b) => b.hitCount - a.hitCount);
}

/**
 * Reset all accumulated rule statistics.
 */
export function resetStatistics(): void {
  statistics.clear();
}

/**
 * Clear the compiled regex cache.
 * Useful for testing or when pattern sets change dramatically.
 */
export function clearRegexCache(): void {
  regexCache.clear();
}
