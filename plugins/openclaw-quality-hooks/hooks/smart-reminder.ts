import process from "node:process";
import { getCommand, isExecLikeTool, type BeforeToolEvent, type Logger, type ToolContext } from "./shared.ts";

const LONG_RUNNING_PATTERNS = [
  /\bnpm\s+(run\s+)?test\b/,
  /\bpnpm\s+(run\s+)?test\b/,
  /\byarn\s+(run\s+)?test\b/,
  /\bbun\s+(run\s+)?test\b/,
  /\bcargo\s+(build|test)\b/,
  /\bpytest\b/,
  /\bgo\s+test\b/,
  /\bdocker(?:-compose|\s+compose)?\b/,
  /\bplaywright\b/,
  /\bvitest\b/
];

export function runSmartReminder(event: BeforeToolEvent, context: ToolContext, logger: Logger, logDir: string): void {
  if (!isExecLikeTool(event.toolName)) return;

  const command = getCommand(event.params);
  if (!command) return;

  const sessionLabel = context.sessionId || context.sessionKey || "unknown-session";
  const inTmux = Boolean(process.env.TMUX);

  if (!inTmux && LONG_RUNNING_PATTERNS.some(pattern => pattern.test(command))) {
    logger.warn?.(`[openclaw-quality-hooks] Long-running command outside tmux for ${sessionLabel}: ${command}`);
    logger.warn?.("[openclaw-quality-hooks] Suggestion: tmux new -s dev");
  }

  if (/^\s*git\s+push\b/.test(command)) {
    logger.warn?.(`[openclaw-quality-hooks] Review changes before push in ${sessionLabel}. Suggested: git status && git diff --stat`);
  }
}
