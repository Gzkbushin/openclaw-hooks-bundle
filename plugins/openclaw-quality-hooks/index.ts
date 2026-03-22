import { fileURLToPath } from "node:url";
import { runAutoFormatter } from "./hooks/auto-formatter.ts";
import { runConsoleLogAudit } from "./hooks/console-log-audit.ts";
import { runDangerBlocker } from "./hooks/danger-blocker.ts";
import { scheduleQualityGate } from "./hooks/quality-gate.ts";
import { runSmartReminder } from "./hooks/smart-reminder.ts";
import { expandHome, normalizeToolName, resolvePluginConfig, type Logger, withSafeErrorHandling } from "./hooks/shared.ts";
import type { AuditLoggerConfig } from "./hooks/audit-logger.ts";

type PluginApi = {
  pluginConfig?: Record<string, unknown>;
  logger: Logger;
  on: (hookName: string, handler: (event: any, ctx: any) => unknown, opts?: { priority?: number }) => void;
};

type PluginConfig = {
  enabled?: boolean;
  configFile?: string;
  logDir?: string;
  audit?: AuditLoggerConfig;
};

export const plugin = {
  id: "openclaw-quality-hooks",
  name: "OpenClaw Quality Hooks",
  version: "1.0.0",
  description: "ECC-style safety, reminders, formatting, and quality-gate hooks",
  register(api: PluginApi) {
    const config = resolvePluginConfig(
      api.pluginConfig,
      fileURLToPath(new URL("./openclaw.config.json", import.meta.url)),
      api.logger
    ) as PluginConfig;
    if (config.enabled === false) {
      api.logger.info?.("openclaw-quality-hooks disabled by config");
      return;
    }

    const logDir = expandHome(config.logDir || "~/.openclaw/logs/openclaw-quality-hooks");

    api.on(
      "before_tool_call",
      (event, ctx) => {
        const normalizedEvent = {
          toolName: normalizeToolName(event.toolName),
          params: event.params || {}
        };
        const blocked = withSafeErrorHandling(
          "DangerBlocker",
          () => runDangerBlocker(normalizedEvent, api.logger, logDir, config.audit, ctx || {}),
          api.logger
        );
        if (blocked?.block) return blocked;
        withSafeErrorHandling("SmartReminder", () => {
          runSmartReminder(normalizedEvent, ctx || {}, api.logger, logDir);
        }, api.logger);
        return undefined;
      },
      { priority: 50 }
    );

    api.on(
      "after_tool_call",
      event => {
        const normalizedEvent = {
          ...event,
          toolName: normalizeToolName(event.toolName),
          params: event.params || {}
        };
        withSafeErrorHandling("ConsoleLogAudit", () => {
          runConsoleLogAudit(normalizedEvent, api.logger);
        }, api.logger);
        withSafeErrorHandling("AutoFormatter", () => {
          runAutoFormatter(normalizedEvent, api.logger);
        }, api.logger);
        withSafeErrorHandling("QualityGate", () => {
          scheduleQualityGate(normalizedEvent, api.logger, logDir);
        }, api.logger);
      },
      { priority: 50 }
    );

    api.logger.info?.("openclaw-quality-hooks registered");
  }
};

export default plugin;
