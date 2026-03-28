// DEPRECATED: Use hookify-engine rules instead.
// This module is retained for backward compatibility — when hookify-engine is
// not available, openclaw-quality-hooks falls back to this built-in blocker.
// See plugins/hookify-engine/src/rules/ for equivalent declarative rules.

import { writeAuditEvent, type AuditLoggerConfig, type AuditEventType } from "./audit-logger.ts";
import { getCommand, isExecLikeTool, type BeforeToolEvent, type BeforeToolResult, type Logger, type ToolContext } from "./shared.ts";

function hasApprovedOverride(params: Record<string, unknown>): boolean {
  return params.approved === true;
}

function recordAuditEvent(
  baseLogDir: string | undefined,
  logger: Logger | undefined,
  auditConfig: AuditLoggerConfig | undefined,
  event: BeforeToolEvent,
  ctx: ToolContext | undefined,
  type: AuditEventType,
  action: "blocked" | "allowed",
  command: string,
  reason: string
): void {
  if (!baseLogDir) return;

  try {
    writeAuditEvent(
      baseLogDir,
      {
        type,
        action,
        severity: action === "blocked" ? "critical" : "warn",
        toolName: event.toolName,
        command,
        reason,
        approved: hasApprovedOverride(event.params),
        sessionId: ctx?.sessionId,
        runId: ctx?.runId
      },
      auditConfig
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.warn?.(`[Hook] AuditLogger failed: ${msg}`);
  }
}

export function runDangerBlocker(
  event: BeforeToolEvent,
  logger?: Logger,
  baseLogDir?: string,
  auditConfig?: AuditLoggerConfig,
  ctx?: ToolContext
): BeforeToolResult | undefined {
  if (!isExecLikeTool(event.toolName)) return undefined;

  const command = getCommand(event.params);
  if (!command) return undefined;

  if (/\brm\s+-[^\n]*[rf][^\n]*\b/.test(command) && !hasApprovedOverride(event.params)) {
    const reason = "Blocked dangerous command: `rm -rf` requires `approved: true`.";
    recordAuditEvent(baseLogDir, logger, auditConfig, event, ctx, "dangerous_command_blocked", "blocked", command, reason);
    return {
      block: true,
      blockReason: reason
    };
  }

  if (/\brm\s+-[^\n]*[rf][^\n]*\b/.test(command)) {
    recordAuditEvent(
      baseLogDir,
      logger,
      auditConfig,
      event,
      ctx,
      "dangerous_command_allowed",
      "allowed",
      command,
      "Allowed dangerous command because `approved: true` was provided."
    );
    return undefined;
  }

  if (/(^|\s)--no-verify(\s|$)/.test(command)) {
    const reason = "Blocked git hook bypass: `--no-verify` is not allowed.";
    recordAuditEvent(baseLogDir, logger, auditConfig, event, ctx, "git_hook_bypass_blocked", "blocked", command, reason);
    return {
      block: true,
      blockReason: reason
    };
  }

  if (/(^|\s):q!(\s|$)/.test(command)) {
    const reason = "Blocked unsafe editor exit `:q!` to avoid discarding changes.";
    recordAuditEvent(baseLogDir, logger, auditConfig, event, ctx, "unsafe_editor_exit_blocked", "blocked", command, reason);
    return {
      block: true,
      blockReason: reason
    };
  }

  return undefined;
}
