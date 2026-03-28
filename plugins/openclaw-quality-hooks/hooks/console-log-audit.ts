// DEPRECATED: Use hookify-engine rules instead.
// This module is retained for backward compatibility — when hookify-engine is
// not available, openclaw-quality-hooks falls back to this built-in auditor.
// See plugins/hookify-engine/src/rules/warn-debug-code.md for the equivalent rule.

import { readFileSync } from "node:fs";
import { getFilePath, shortPath, type AfterToolEvent, type Logger } from "./shared.ts";

const AUDIT_TOOLS = new Set(["edit", "write"]);
const CONSOLE_LOG_PATTERN = /\bconsole\.log\s*\(/;

export function runConsoleLogAudit(event: AfterToolEvent, logger: Logger): void {
  if (!AUDIT_TOOLS.has(event.toolName.toLowerCase())) return;

  const filePath = getFilePath(event.params);
  if (!filePath) return;

  try {
    const content = readFileSync(filePath, "utf8");
    if (!CONSOLE_LOG_PATTERN.test(content)) return;

    logger.warn?.(`[Hook] ⚠️ Console.log detected in ${shortPath(filePath)}`);
    logger.warn?.("[Hook] 💡 Consider removing or replacing with proper logging");
  } catch {
    // Ignore unreadable or transient files; this hook is advisory only.
  }
}
