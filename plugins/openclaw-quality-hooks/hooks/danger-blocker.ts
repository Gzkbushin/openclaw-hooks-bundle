import { getCommand, isExecLikeTool, type BeforeToolEvent, type BeforeToolResult } from "./shared.ts";

function hasApprovedOverride(params: Record<string, unknown>): boolean {
  return params.approved === true;
}

export function runDangerBlocker(event: BeforeToolEvent): BeforeToolResult | undefined {
  if (!isExecLikeTool(event.toolName)) return undefined;

  const command = getCommand(event.params);
  if (!command) return undefined;

  if (/\brm\s+-[^\n]*[rf][^\n]*\b/.test(command) && !hasApprovedOverride(event.params)) {
    return {
      block: true,
      blockReason: "Blocked dangerous command: `rm -rf` requires `approved: true`."
    };
  }

  if (/(^|\s)--no-verify(\s|$)/.test(command)) {
    return {
      block: true,
      blockReason: "Blocked git hook bypass: `--no-verify` is not allowed."
    };
  }

  if (/(^|\s):q!(\s|$)/.test(command)) {
    return {
      block: true,
      blockReason: "Blocked unsafe editor exit `:q!` to avoid discarding changes."
    };
  }

  return undefined;
}
