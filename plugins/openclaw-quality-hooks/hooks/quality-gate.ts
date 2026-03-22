import { dirname, join } from "node:path";
import {
  appendLog,
  findProjectRoot,
  findUp,
  getFilePath,
  resolveCommand,
  spawnBackground,
  type AfterToolEvent,
  type Logger
} from "./shared.ts";

const QUALITY_TOOLS = new Set(["edit", "write", "multiedit"]);

export function scheduleQualityGate(event: AfterToolEvent, logger: Logger, logDir: string): void {
  if (!QUALITY_TOOLS.has(event.toolName.toLowerCase())) return;

  const filePath = getFilePath(event.params);
  if (!filePath) return;

  const projectRoot = findProjectRoot(dirname(filePath));

  if (/\.(ts|tsx)$/.test(filePath)) {
    const tsc = resolveCommand(projectRoot, ["tsc"]);
    const tsconfig = findUp(dirname(filePath), ["tsconfig.json"]);
    if (tsc && tsconfig) {
      appendLog(logDir, "quality-gate.log", `queue tsc for ${filePath}`);
      spawnBackground(
        tsc.bin,
        [...tsc.argsPrefix, "--noEmit", "-p", tsconfig],
        projectRoot,
        logger,
        `TypeScript check (${filePath})`,
        logDir
      );
    }
  }

  if (/\.(ts|tsx|js|jsx)$/.test(filePath)) {
    const eslint = resolveCommand(projectRoot, ["eslint"]);
    if (eslint) {
      appendLog(logDir, "quality-gate.log", `queue eslint for ${filePath}`);
      spawnBackground(
        eslint.bin,
        [...eslint.argsPrefix, filePath],
        projectRoot,
        logger,
        `ESLint check (${filePath})`,
        logDir
      );
    }
  }
}
