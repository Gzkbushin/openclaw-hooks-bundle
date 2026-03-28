/**
 * hookify-engine — Core type definitions
 *
 * Defines all TypeScript types used by the hookify rule engine,
 * including rules, conditions, actions, severity levels, and evaluation results.
 */

/** Severity level for a matched rule */
export type Severity = 'error' | 'warning' | 'info';

/** Action to take when a rule matches */
export type RuleAction = 'warn' | 'block' | 'log';

/** Event filter — determines which OpenClaw lifecycle events a rule listens to */
export type EventFilter =
  | 'before_tool_call'
  | 'after_tool_call'
  | 'session_start'
  | 'before_compaction'
  | 'all';

/** Condition operator — how a condition's pattern is compared against a field value */
export type ConditionOperator =
  | 'regex_match'
  | 'contains'
  | 'equals'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'glob_match'
  | 'not_regex_match';

/**
 * A single condition within a rule.
 * All conditions in a rule must match (AND logic).
 */
export type Condition = {
  /** The field name to extract from the event input (e.g. "command", "file_path") */
  field: string;
  /** The comparison operator to apply */
  operator: ConditionOperator;
  /** The pattern string to match against */
  pattern: string;
};

/**
 * A fully-resolved rule ready for evaluation.
 * Parsed from a markdown file with YAML frontmatter.
 */
export type Rule = {
  /** Human-readable rule name */
  name: string;
  /** Whether the rule is active */
  enabled: boolean;
  /** Which event(s) this rule fires on */
  event: EventFilter;
  /** List of conditions — all must match for the rule to fire */
  conditions: Condition[];
  /** Action to take when the rule matches */
  action: RuleAction;
  /** Severity level for logging / display purposes */
  severity: Severity;
  /** Numeric priority — higher values are evaluated first */
  priority: number;
  /** Message to display when the rule matches (sourced from markdown body) */
  message: string;
  /** Absolute path to the source .md file */
  source: string;
  /** Optional arbitrary key-value metadata */
  metadata?: Record<string, string>;
};

/** A single rule that matched during evaluation, along with which conditions matched */
export type RuleMatchResult = {
  /** The rule that matched */
  rule: Rule;
  /** The individual conditions within the rule that evaluated to true */
  matchedConditions: Condition[];
};

/**
 * Result of evaluating a set of rules against an input.
 * Accumulates all warnings and logs, but stops at the first blocking rule.
 */
export type RuleEngineResult = {
  /** Whether any rule with action='block' matched */
  blocked: boolean;
  /** Accumulated warning messages from matched 'warn' rules */
  warnings: string[];
  /** Reason provided by the blocking rule (if any) */
  blockReason?: string;
  /** Accumulated log messages from matched 'log' rules */
  logs: string[];
  /** Details of every rule that matched during evaluation */
  matchedRules: RuleMatchResult[];
};

/** Per-rule hit statistics for observability */
export type RuleStatistics = {
  /** Name of the rule */
  ruleName: string;
  /** Number of times the rule has matched */
  hitCount: number;
  /** ISO timestamp of the most recent match, or null if never matched */
  lastHitAt: string | null;
  /** The pattern of the most recently matched condition, or null */
  lastMatchedPattern: string | null;
};
