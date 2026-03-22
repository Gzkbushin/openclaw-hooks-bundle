import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

function collectTypeScriptFiles(targetPath: string): string[] {
  const stats = statSync(targetPath);
  if (stats.isFile()) return targetPath.endsWith(".ts") ? [targetPath] : [];

  return readdirSync(targetPath)
    .flatMap(entry => collectTypeScriptFiles(join(targetPath, entry)))
    .sort((left, right) => left.localeCompare(right));
}

const files = [
  join(rootDir, "index.ts"),
  ...collectTypeScriptFiles(join(rootDir, "hooks")),
  ...collectTypeScriptFiles(join(rootDir, "scripts")),
  ...collectTypeScriptFiles(join(rootDir, "test"))
];

const tempDir = mkdtempSync(join(tmpdir(), "openclaw-quality-hooks-lint-"));
const failures: string[] = [];

try {
  files.forEach((filePath, index) => {
    try {
      const stripped = stripTypeScriptTypes(readFileSync(filePath, "utf8"));
      const tempFile = join(tempDir, `${index}.mjs`);
      writeFileSync(tempFile, stripped, "utf8");
      const result = spawnSync(process.execPath, ["--check", tempFile], { encoding: "utf8" });
      if (result.status !== 0) {
        failures.push(`${relative(rootDir, filePath)}: ${(result.stderr || result.stdout).trim()}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      failures.push(`${relative(rootDir, filePath)}: ${msg}`);
    }
  });
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Lint failed:");
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Lint passed for ${files.length} TypeScript files.`);
