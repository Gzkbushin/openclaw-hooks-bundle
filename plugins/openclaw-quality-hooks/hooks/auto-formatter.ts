import { extname } from "node:path";
import {
  findProjectRoot,
  getFilePath,
  hasJsonExtension,
  maybeFormatJsonFallback,
  resolveCommand,
  runSync,
  shortPath,
  type AfterToolEvent,
  type Logger
} from "./shared.ts";

const FORMATTABLE_EDIT_TOOLS = new Set(["edit", "write", "multiedit"]);

export function runAutoFormatter(event: AfterToolEvent, logger: Logger): void {
  if (!FORMATTABLE_EDIT_TOOLS.has(event.toolName.toLowerCase())) return;

  const filePath = getFilePath(event.params);
  if (!filePath) return;

  const ext = extname(filePath).toLowerCase();
  const projectRoot = findProjectRoot(filePath);

  if ([".ts", ".tsx", ".js", ".jsx", ".json"].includes(ext)) {
    const biome = resolveCommand(projectRoot, ["biome"]);
    if (biome) {
      const result = runSync(biome.bin, [...biome.argsPrefix, "check", "--write", filePath], projectRoot);
      if (result.status === 0) return;
    }

    const prettier = resolveCommand(projectRoot, ["prettier"]);
    if (prettier) {
      const result = runSync(prettier.bin, [...prettier.argsPrefix, "--write", filePath], projectRoot);
      if (result.status === 0) return;
    }

    if (hasJsonExtension(filePath) && maybeFormatJsonFallback(filePath)) {
      logger.info?.(`[openclaw-quality-hooks] Formatted JSON fallback for ${shortPath(filePath)}`);
    }
    return;
  }

  if (ext === ".py") {
    const ruff = resolveCommand(projectRoot, ["ruff"]);
    if (!ruff) return;
    runSync(ruff.bin, [...ruff.argsPrefix, "format", filePath], projectRoot);
  }
}
