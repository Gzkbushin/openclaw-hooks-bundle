import { mapBeforeToolCallToInput } from "../event-mapper.ts";
import { loadRules } from "../rule-loader.ts";
import { evaluateRules } from "../rule-engine.ts";
import type {
  BeforeToolEvent,
  BeforeToolResult,
  Logger,
  ToolContext
} from "../shared.ts";

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

  const result = evaluateRules(rules, input);

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
