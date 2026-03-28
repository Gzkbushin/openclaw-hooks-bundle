/**
 * hookify-engine — Event Mapper
 *
 * Maps OpenClaw hook events into the generic input format consumed by
 * `evaluateRules()`. This decouples the rule engine from OpenClaw-specific
 * event shapes, keeping evaluation logic framework-agnostic.
 *
 * Each mapper produces a flat `Record<string, unknown>` containing:
 * - `hook_event_name` — identifies the event type for rule filtering
 * - `tool_name` — the tool being called (if applicable)
 * - `tool_input` — the tool's parameters
 * - Optional context fields: `session_id`, `session_key`, `run_id`
 */

// ---------------------------------------------------------------------------
// OpenClaw Event Types
// ---------------------------------------------------------------------------

/** Shape of an OpenClaw `before_tool_call` hook event */
export type OpenClawBeforeToolCall = {
  /** Name of the tool about to be called */
  toolName: string;
  /** Parameters passed to the tool */
  params: Record<string, unknown>;
};

/** Shape of an OpenClaw `after_tool_call` hook event */
export type OpenClawAfterToolCall = {
  /** Name of the tool that was called */
  toolName: string;
  /** Parameters that were passed to the tool */
  params: Record<string, unknown>;
  /** Return value from the tool (if successful) */
  result?: unknown;
  /** Error message (if the tool failed) */
  error?: string;
  /** Execution duration in milliseconds */
  durationMs?: number;
};

/** Optional context fields appended to every mapped event */
export type EventContext = {
  sessionId?: string;
  sessionKey?: string;
  runId?: string;
};

// ---------------------------------------------------------------------------
// Mapper Functions
// ---------------------------------------------------------------------------

/**
 * Map an OpenClaw `before_tool_call` event to the hookify input format.
 *
 * The mapped input includes:
 * - `hook_event_name`: `"before_tool_call"`
 * - `tool_name`: the tool name (normalised to lowercase)
 * - `tool_input`: shallow copy of the tool parameters
 * - Context fields from `ctx` (if provided)
 *
 * @param event - The OpenClaw before_tool_call event
 * @param ctx - Optional session/run context
 * @returns Flat record suitable for `evaluateRules()`
 */
export function mapBeforeToolCallToInput(
  event: OpenClawBeforeToolCall,
  ctx?: EventContext
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    hook_event_name: "before_tool_call",
    tool_name: (event.toolName || "").toLowerCase(),
    tool_input: { ...event.params },
  };

  if (ctx?.sessionId) {
    input.session_id = ctx.sessionId;
  }
  if (ctx?.sessionKey) {
    input.session_key = ctx.sessionKey;
  }
  if (ctx?.runId) {
    input.run_id = ctx.runId;
  }

  return input;
}

/**
 * Map an OpenClaw `after_tool_call` event to the hookify input format.
 *
 * The mapped input includes:
 * - `hook_event_name`: `"after_tool_call"`
 * - `tool_name`: the tool name (normalised to lowercase)
 * - `tool_input`: shallow copy of the tool parameters, plus `error` and `duration_ms`
 * - Context fields from `ctx` (if provided)
 *
 * If the tool returned a string result, it's also added to `tool_input.new_text`
 * for compatibility with diff/patch rules that expect `new_text`.
 *
 * @param event - The OpenClaw after_tool_call event
 * @param ctx - Optional session/run context
 * @returns Flat record suitable for `evaluateRules()`
 */
export function mapAfterToolCallToInput(
  event: OpenClawAfterToolCall,
  ctx?: EventContext
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    hook_event_name: "after_tool_call",
    tool_name: (event.toolName || "").toLowerCase(),
    tool_input: { ...event.params },
  };

  const toolInput = input.tool_input as Record<string, unknown>;

  // Attach error if present
  if (event.error) {
    toolInput.error = event.error;
  }

  // Attach duration if present
  if (event.durationMs !== undefined) {
    toolInput.duration_ms = event.durationMs;
  }

  // If result is a string, expose it as new_text for diff rules
  if (typeof event.result === "string") {
    toolInput.new_text = event.result;
  }
  // If result is an object with text-like fields, pull them out
  if (event.result && typeof event.result === "object" && event.result !== null) {
    const result = event.result as Record<string, unknown>;
    if (typeof result.new_text === "string") {
      toolInput.new_text = result.new_text;
    }
    if (typeof result.new_string === "string") {
      toolInput.new_text = result.new_string;
      toolInput.new_string = result.new_string;
    }
    if (typeof result.content === "string") {
      toolInput.content = result.content;
    }
  }

  if (ctx?.sessionId) {
    input.session_id = ctx.sessionId;
  }
  if (ctx?.sessionKey) {
    input.session_key = ctx.sessionKey;
  }
  if (ctx?.runId) {
    input.run_id = ctx.runId;
  }

  return input;
}
