import { fileURLToPath } from "node:url";
import {
  expandHome,
  resolvePluginConfig,
  withSafeErrorHandling,
  type Logger,
} from "./src/shared.ts";
import { runBeforeToolCall } from "./src/hooks/before-tool-call.ts";
import { runAfterToolCall } from "./src/hooks/after-tool-call.ts";

// ---------------------------------------------------------------------------
// Graceful definePluginEntry import (SDK only available in OpenClaw runtime)
// ---------------------------------------------------------------------------

let definePluginEntry: <T>(def: T) => T;
try {
  const mod = await import("openclaw/plugin-sdk/plugin-entry");
  definePluginEntry = (mod as { definePluginEntry: typeof definePluginEntry }).definePluginEntry;
} catch {
  // Standalone/testing fallback: identity wrapper
  definePluginEntry = <T>(def: T) => def;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PluginApi = {
  pluginConfig?: Record<string, unknown>;
  logger: Logger;
  registerHook: (opts: {
    event: string;
    priority?: number;
    handler: (event: any, ctx: any) => unknown;
  }) => void;
};

type PluginConfig = {
  enabled?: boolean;
  rulesDir?: string;
  configFile?: string;
  maxRegexCacheSize?: number;
};

const pluginConfigSchema = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    rulesDir: { type: "string" },
    configFile: { type: "string" },
    maxRegexCacheSize: { type: "integer" }
  }
} as const;

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

const pluginEntry = definePluginEntry({
  id: "hookify-engine",
  name: "Hookify Engine",
  version: "2.0.0",
  description:
    "Declarative markdown-based rule engine for OpenClaw — ported from Claude Code hookify",

  register(api: PluginApi) {
    // 1. Resolve config
    const config = resolvePluginConfig(
      api.pluginConfig,
      fileURLToPath(new URL("./openclaw.config.json", import.meta.url)),
      api.logger,
      {
        pluginKeys: [
          "hookifyEngine",
          "hookify-engine",
          "hookify",
        ],
        schema: pluginConfigSchema,
      }
    ) as PluginConfig;

    // 2. Skip if disabled
    if (config.enabled === false) {
      api.logger.info?.("hookify-engine disabled by config");
      return;
    }

    const rulesDir = expandHome(config.rulesDir ?? "~/.openclaw/rules");

    // Expose resolved config for rule-loader / rule-engine via env or
    // a lightweight module-level setter so downstream modules can pick it
    // up without circular imports.  We keep this simple — store on
    // `globalThis` under a namespaced key.
    (globalThis as Record<string, unknown>).__hookifyEngineConfig = {
      rulesDir,
      configFile: config.configFile,
      maxRegexCacheSize: config.maxRegexCacheSize ?? 256,
    };

    // 3. Register before_tool_call — priority 40 (runs before quality-hooks at 50)
    api.registerHook({
      event: "before_tool_call",
      priority: 40,
      handler: (event, ctx) => {
        return withSafeErrorHandling(
          "HookifyEngine/before_tool_call",
          () => runBeforeToolCall(event, api.logger, ctx ?? {}),
          api.logger
        );
      },
    });

    // 4. Register after_tool_call — priority 40
    api.registerHook({
      event: "after_tool_call",
      priority: 40,
      handler: (event, ctx) => {
        return withSafeErrorHandling(
          "HookifyEngine/after_tool_call",
          () => runAfterToolCall(event, api.logger, ctx ?? {}),
          api.logger
        );
      },
    });

    // 5. Log success
    api.logger.info?.(
      `hookify-engine v2.0.0 registered (rulesDir=${rulesDir})`
    );
  },
});

export const plugin = pluginEntry;   // Named export for test compatibility
export default pluginEntry;           // Default export for OpenClaw runtime
