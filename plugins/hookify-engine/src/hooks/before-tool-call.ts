import { mapBeforeToolCallToInput } from "../event-mapper.ts";
import { loadRules } from "../rule-loader.ts";
import { evaluateRules } from "../rule-engine.ts";

// Inline types to avoid coupling to openclaw-quality-hooks at runtime
// (shared.ts is only used for type information in the parent plugin)
type BeforeToolEvent = {
  toolName: string;
  params: Record<string, unknown>;
};

type BeforeToolResult = {
  block?: boolean;
  blockReason?: string;
  params?: Record<string, unknown>;
};

type Logger = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
};

type ToolContext = {
  sessionId?: string;
  sessionKey?: string;
  runId?: string;
  toolName?: string;
};

/**
 * before_tool_call hook for hookify-engine.
 *
 * Maps the event to a rule-engine input, loads all rules bound to
 * `before_tool_call`, evaluates them, and returns a block result
 * or logs warnings as appropriate.
 *
 * Returns `undefined` when no rules apply (passthrough).
 */
export function runBeforeToolCall(
  event: BeforeToolEvent,
  logger: Logger,
  ctx?: ToolContext
): BeforeToolResult | undefined {
  const input = mapBeforeToolCallToInput(event, ctx);
  const rules = loadRules("before_tool_call");

  if (rules.length === 0) {
    return undefined;
  }

  const result = evaluateRules(input, rules);

  // Warnings — advisory, never block
  if (result.warnings && result.warnings.length > 0) {
    for (const warning of result.warnings) {
      logger.warn?.(`[hookify-engine] ${warning}`);
    }
  }

  // Hard block — stop the tool call
  if (result.blocked) {
    return {
      block: true,
      blockReason: result.blockReason ?? "Blocked by hookify-engine rule"
    };
  }

  return undefined;
}
