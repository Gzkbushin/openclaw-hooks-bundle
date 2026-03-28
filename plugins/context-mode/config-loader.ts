import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

type Logger = {
  warn?: (...args: unknown[]) => void;
};

type ConfigPrimitiveType = "boolean" | "string" | "integer" | "object";

type ConfigPropertySchema = {
  type: ConfigPrimitiveType;
  properties?: Record<string, ConfigPropertySchema>;
};

type ConfigObjectSchema = {
  type: "object";
  properties: Record<string, ConfigPropertySchema>;
};

type ResolvePluginConfigOptions = {
  pluginKeys?: string[];
  schema?: ConfigObjectSchema;
};

export type ResourceLimitsConfig = {
  maxContextSnapshots?: number;
  maxMemorySnapshots?: number;
  snapshotRetentionDays?: number;
};

function expandHomePath(input: string): string {
  if (!input.startsWith("~")) return input;
  return join(process.env.HOME || "", input.slice(1));
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseYamlScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  return stripQuotes(trimmed);
}

function parseYamlObject(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; value: Record<string, unknown> }> = [{ indent: -1, value: root }];

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = rawLine.length - rawLine.trimStart().length;
    while (stack.length > 1 && indent <= (stack.at(-1)?.indent ?? -1)) {
      stack.pop();
    }

    const parent = stack.at(-1)?.value;
    if (!parent) continue;

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex < 1) {
      throw new Error(`Invalid YAML line ${index + 1}: expected key: value`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const remainder = trimmed.slice(separatorIndex + 1).trim();
    if (!key) {
      throw new Error(`Invalid YAML line ${index + 1}: missing key`);
    }

    if (!remainder) {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, value: child });
      continue;
    }

    parent[key] = parseYamlScalar(remainder);
  }

  return root;
}

function parseConfigObject(text: string, filePath: string): Record<string, unknown> {
  if (/\.ya?ml$/i.test(filePath)) {
    return parseYamlObject(text);
  }

  const parsed = JSON.parse(text);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("expected a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function warnInvalidConfig(origin: string, message: string, logger?: Logger): void {
  logger?.warn?.(`[Hook] Ignoring config in ${origin}: ${message}`);
}

function loadObjectFile(filePath: string, logger?: Logger): Record<string, unknown> {
  if (!existsSync(filePath)) return {};

  try {
    const parsed = parseConfigObject(readFileSync(filePath, "utf8"), filePath);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      warnInvalidConfig(filePath, "expected an object", logger);
      return {};
    }
    return parsed;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnInvalidConfig(filePath, msg, logger);
    return {};
  }
}

function findUp(startDir: string, candidates: string[]): string | undefined {
  let current = resolve(startDir);
  while (true) {
    for (const candidate of candidates) {
      const filePath = join(current, candidate);
      if (existsSync(filePath)) return filePath;
    }

    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function getProjectConfigPath(): string | undefined {
  return findUp(process.cwd(), ["openclaw-hooks.config.yaml", "openclaw-hooks.config.yml"]);
}

function getUserConfigPath(): string | undefined {
  for (const candidate of ["~/.openclaw-hooks.config.yaml", "~/.openclaw-hooks.config.yml"]) {
    const filePath = expandHomePath(candidate);
    if (existsSync(filePath)) return filePath;
  }
  return undefined;
}

function pickPluginScopedConfig(
  source: Record<string, unknown>,
  pluginKeys: string[] | undefined,
): Record<string, unknown> {
  if (!pluginKeys || pluginKeys.length === 0) return { ...source };

  for (const key of pluginKeys) {
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return { ...(value as Record<string, unknown>) };
    }
  }

  return { ...source };
}

function matchesSchemaType(value: unknown, type: ConfigPrimitiveType): boolean {
  if (type === "boolean") return typeof value === "boolean";
  if (type === "string") return typeof value === "string";
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateObject(
  value: Record<string, unknown>,
  schema: ConfigObjectSchema | undefined,
  origin: string,
  logger?: Logger,
): Record<string, unknown> {
  if (!schema) return value;

  const filtered: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    const propertySchema = schema.properties[key];
    if (!propertySchema) {
      warnInvalidConfig(origin, `unknown key "${key}"`, logger);
      continue;
    }

    if (!matchesSchemaType(raw, propertySchema.type)) {
      warnInvalidConfig(origin, `"${key}" must be ${propertySchema.type}`, logger);
      continue;
    }

    if (propertySchema.type === "object") {
      filtered[key] = validateObject(
        raw as Record<string, unknown>,
        { type: "object", properties: propertySchema.properties || {} },
        `${origin}:${key}`,
        logger,
      );
      continue;
    }

    filtered[key] = raw;
  }

  return filtered;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeConfigObjects(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = mergeConfigObjects(merged[key] as Record<string, unknown>, value);
      continue;
    }
    merged[key] = value;
  }

  return merged;
}

function loadLayerConfig(
  filePath: string | undefined,
  pluginKeys: string[] | undefined,
  schema: ConfigObjectSchema | undefined,
  logger?: Logger,
): Record<string, unknown> {
  if (!filePath) return {};
  const parsed = loadObjectFile(filePath, logger);
  const scoped = pickPluginScopedConfig(parsed, pluginKeys);
  delete scoped.configFile;
  return validateObject(scoped, schema, filePath, logger);
}

export function resolvePluginConfig(
  inlineConfig: Record<string, unknown> | undefined,
  defaultConfigPath: string,
  logger?: Logger,
  options: ResolvePluginConfigOptions = {},
): Record<string, unknown> {
  const mergedInlineConfig = inlineConfig ? { ...inlineConfig } : {};
  const rawConfigFile = mergedInlineConfig.configFile;
  delete mergedInlineConfig.configFile;

  const explicitConfigPath =
    typeof rawConfigFile === "string" && rawConfigFile.trim() !== ""
      ? resolve(dirname(defaultConfigPath), expandHomePath(rawConfigFile.trim()))
      : undefined;

  const defaultConfig = loadLayerConfig(defaultConfigPath, options.pluginKeys, options.schema, logger);
  const userConfig = loadLayerConfig(getUserConfigPath(), options.pluginKeys, options.schema, logger);
  const projectConfig = loadLayerConfig(getProjectConfigPath(), options.pluginKeys, options.schema, logger);
  const explicitConfig = loadLayerConfig(explicitConfigPath, options.pluginKeys, options.schema, logger);
  const validatedInlineConfig = validateObject(mergedInlineConfig, options.schema, "inline config", logger);

  return [defaultConfig, userConfig, projectConfig, explicitConfig, validatedInlineConfig].reduce(
    (merged, layer) => mergeConfigObjects(merged, layer),
    {},
  );
}
