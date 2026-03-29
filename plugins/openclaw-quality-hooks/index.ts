import { fileURLToPath } from "node:url";
import { runAutoFormatter } from "./hooks/auto-formatter.ts";
import { runConsoleLogAudit } from "./hooks/console-log-audit.ts";
import { runDangerBlocker } from "./hooks/danger-blocker.ts";
import { scheduleQualityGate } from "./hooks/quality-gate.ts";
import { runSmartReminder } from "./hooks/smart-reminder.ts";
import { expandHome, normalizeToolName, resolvePluginConfig, type Logger, withSafeErrorHandling } from "./hooks/shared.ts";
import type { AuditLoggerConfig } from "./hooks/audit-logger.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HookifyResult = {
  block?: boolean;
  blockReason?: string;
  warnings?: string[];
  logs?: string[];
};

type HookifyBeforeHandler = (event: any, logger: Logger, ctx?: any) => HookifyResult | undefined;
type HookifyAfterHandler = (event: any, logger: Logger, ctx?: any) => HookifyResult | undefined;

type PluginApi = {
  pluginConfig?: Record<string, unknown>;
  logger: Logger;
  on: (event: string, handler: (event: any, ctx: any) => unknown, options?: { priority?: number }) => void;
};

type PluginConfig = {
  enabled?: boolean;
  configFile?: string;
  logDir?: string;
  audit?: AuditLoggerConfig;
};

const pluginConfigSchema = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    configFile: { type: "string" },
    logDir: { type: "string" },
    audit: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        logDir: { type: "string" },
        fileName: { type: "string" },
        maxBytes: { type: "integer" },
        maxFiles: { type: "integer" }
      }
    }
  }
} as const;

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

const plugin = {
  id: "openclaw-quality-hooks",
  name: "OpenClaw Quality Hooks",
  version: "1.0.0",
  description: "ECC-style safety, reminders, formatting, and quality-gate hooks (with hookify-engine integration)",
  register(api: PluginApi) {
    const config = resolvePluginConfig(
      api.pluginConfig,
      fileURLToPath(new URL("./openclaw.config.json", import.meta.url)),
      api.logger,
      {
        pluginKeys: ["qualityHooks", "openclaw-quality-hooks", "openclawQualityHooks"],
        schema: pluginConfigSchema
      }
    ) as PluginConfig;
    if (config.enabled === false) {
      api.logger.info?.("openclaw-quality-hooks disabled by config");
      return;
    }

    // Read hookify-engine hooks from globalThis (set by hookify-engine plugin)
    const hookifyEngine = (globalThis as Record<string, unknown>).__hookifyEngineHooks as
      {
        runBeforeToolCall?: HookifyBeforeHandler;
        beforeToolCall?: HookifyBeforeHandler;
        runAfterToolCall?: HookifyAfterHandler;
        afterToolCall?: HookifyAfterHandler;
      }
      | undefined;
    const runHookifyBefore = hookifyEngine?.runBeforeToolCall ?? hookifyEngine?.beforeToolCall;
    const runHookifyAfter = hookifyEngine?.runAfterToolCall ?? hookifyEngine?.afterToolCall;

    const logDir = expandHome(config.logDir || "~/.openclaw/logs/openclaw-quality-hooks");

    // Log hookify-engine integration status
    if (runHookifyBefore || runHookifyAfter) {
      api.logger.info?.("openclaw-quality-hooks: hookify-engine integration active");
    } else {
      api.logger.info?.("openclaw-quality-hooks: hookify-engine not available, using built-in hooks as fallback");
    }

    // ---- before_tool_call ---------------------------------------------------
    // Priority chain:
    //   1. hookify-engine before_tool_call (if available) — rule evaluation
    //   2. built-in danger-blocker (fallback when hookify-engine is absent)
    //   3. smart-reminder (always runs if not blocked)
    api.on("before_tool_call", (event, ctx) => {
      const normalizedEvent = {
        toolName: normalizeToolName(event.toolName),
        params: event.params || {}
      };

      // Step 1: hookify-engine rule evaluation
      if (runHookifyBefore) {
        const hookifyResult = withSafeErrorHandling(
          "HookifyBeforeToolCall",
          () => runHookifyBefore(normalizedEvent, api.logger, ctx || {}),
          api.logger
        );
        if (hookifyResult) {
          // Log any warnings from hookify-engine
          if (hookifyResult.warnings?.length) {
            for (const w of hookifyResult.warnings) {
              api.logger.warn?.(`[Hook] ${w}`);
            }
          }
          // Log any log-level results from hookify-engine
          if (hookifyResult.logs?.length) {
            for (const l of hookifyResult.logs) {
              api.logger.info?.(`[Hook] ${l}`);
            }
          }
          // If hookify-engine blocked, return immediately
          if (hookifyResult.block) {
            return { block: true, blockReason: hookifyResult.blockReason };
          }
        }
      }

      // Step 2: built-in danger-blocker (fallback when hookify-engine is absent)
      if (!runHookifyBefore) {
        const blocked = withSafeErrorHandling(
          "DangerBlocker",
          () => runDangerBlocker(normalizedEvent, api.logger, logDir, config.audit, ctx || {}),
          api.logger
        );
        if (blocked?.block) return blocked;
      }

      // Step 3: smart-reminder always runs if not blocked
      withSafeErrorHandling("SmartReminder", () => {
        runSmartReminder(normalizedEvent, ctx || {}, api.logger, logDir);
      }, api.logger);

      return undefined;
    }, { priority: 50 });

    // ---- after_tool_call ----------------------------------------------------
    // Priority chain:
    //   1. hookify-engine after_tool_call (if available) — rule evaluation
    //   2. built-in console-log-audit (fallback when hookify-engine is absent)
    //   3. auto-formatter (always runs)
    //   4. quality-gate (always runs)
    api.on("after_tool_call", (event, ctx) => {
      const normalizedEvent = {
        ...event,
        toolName: normalizeToolName(event.toolName),
        params: event.params || {}
      };

      // Step 1: hookify-engine rule evaluation
      if (runHookifyAfter) {
        const hookifyResult = withSafeErrorHandling(
          "HookifyAfterToolCall",
          () => runHookifyAfter(normalizedEvent, api.logger, ctx || {}),
          api.logger
        );
        if (hookifyResult) {
          // Log any warnings from hookify-engine
          if (hookifyResult.warnings?.length) {
            for (const w of hookifyResult.warnings) {
              api.logger.warn?.(`[Hook] ${w}`);
            }
          }
          // Log any log-level results from hookify-engine
          if (hookifyResult.logs?.length) {
            for (const l of hookifyResult.logs) {
              api.logger.info?.(`[Hook] ${l}`);
            }
          }
        }
      }

      // Step 2: built-in console-log-audit (fallback when hookify-engine is absent)
      if (!runHookifyAfter) {
        withSafeErrorHandling("ConsoleLogAudit", () => {
          runConsoleLogAudit(normalizedEvent, api.logger);
        }, api.logger);
      }

      // Step 3: auto-formatter always runs
      withSafeErrorHandling("AutoFormatter", () => {
        runAutoFormatter(normalizedEvent, api.logger);
      }, api.logger);

      // Step 4: quality-gate always runs
      withSafeErrorHandling("QualityGate", () => {
        scheduleQualityGate(normalizedEvent, api.logger, logDir);
      }, api.logger);
    }, { priority: 50 });

    api.logger.info?.("openclaw-quality-hooks registered (v2.0.0)");
  }
};

export { plugin };
export default plugin;
