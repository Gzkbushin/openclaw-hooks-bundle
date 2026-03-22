import { runAutoFormatter } from "./hooks/auto-formatter.ts";
import { runConsoleLogAudit } from "./hooks/console-log-audit.ts";
import { runDangerBlocker } from "./hooks/danger-blocker.ts";
import { scheduleQualityGate } from "./hooks/quality-gate.ts";
import { runSmartReminder } from "./hooks/smart-reminder.ts";
import { expandHome, normalizeToolName, type Logger } from "./hooks/shared.ts";

type PluginApi = {
  pluginConfig?: Record<string, unknown>;
  logger: Logger;
  on: (hookName: string, handler: (event: any, ctx: any) => unknown, opts?: { priority?: number }) => void;
};

type PluginConfig = {
  enabled?: boolean;
  logDir?: string;
};

export const plugin = {
  id: "openclaw-quality-hooks",
  name: "OpenClaw Quality Hooks",
  version: "1.0.0",
  description: "ECC-style safety, reminders, formatting, and quality-gate hooks",
  register(api: PluginApi) {
    const config = (api.pluginConfig || {}) as PluginConfig;
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
        const blocked = runDangerBlocker(normalizedEvent);
        if (blocked?.block) return blocked;
        runSmartReminder(normalizedEvent, ctx || {}, api.logger, logDir);
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
        runConsoleLogAudit(normalizedEvent, api.logger);
        runAutoFormatter(normalizedEvent, api.logger);
        scheduleQualityGate(normalizedEvent, api.logger, logDir);
      },
      { priority: 50 }
    );

    api.logger.info?.("openclaw-quality-hooks registered");
  }
};

export default plugin;
