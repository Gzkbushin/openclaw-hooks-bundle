import { mapAfterToolCallToInput } from "../event-mapper.ts";
import { loadRules } from "../rule-loader.ts";
import { evaluateRules } from "../rule-engine.ts";
import type { AfterToolEvent, Logger, ToolContext } from "../shared.ts";

/**
 * after_tool_call hook for hookify-engine.
 *
 * Maps the event to a rule-engine input, loads all rules bound to
 * `after_tool_call`, evaluates them, and surfaces warnings and
 * informational log entries.  After-tool-call hooks never block
 * execution; they are purely advisory / observability.
 *
 * Returns `undefined` (no return value expected by the framework).
 */
export function runAfterToolCall(
  event: AfterToolEvent,
  logger: Logger,
  ctx?: ToolContext
): void {
  const input = mapAfterToolCallToInput(event, ctx);
  const rules = loadRules("after_tool_call");

  if (rules.length === 0) {
    return;
  }

  const result = evaluateRules(input, rules);

  // Informational log entries
  if (result.logs && result.logs.length > 0) {
    for (const entry of result.logs) {
      logger.info?.(`[hookify-engine] ${entry}`);
    }
  }

  // Warnings — advisory only
  if (result.warnings && result.warnings.length > 0) {
    for (const warning of result.warnings) {
      logger.warn?.(`[hookify-engine] ${warning}`);
    }
  }
}
