import test from "node:test";
import assert from "node:assert/strict";
import { accessSync, existsSync, readFileSync } from "node:fs";
import { constants } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"));
}

test("release metadata stays aligned", () => {
  const rootPackage = readJson("package.json");
  const hookifyPackage = readJson("plugins/hookify-engine/package.json");
  const hookifyManifest = readJson("plugins/hookify-engine/openclaw.plugin.json");
  const qualityPackage = readJson("plugins/openclaw-quality-hooks/package.json");
  const qualityManifest = readJson("plugins/openclaw-quality-hooks/openclaw.plugin.json");
  const contextPackage = readJson("plugins/context-mode/package.json");
  const contextManifest = readJson("plugins/context-mode/openclaw.plugin.json");
  const changelog = readFileSync(resolve(repoRoot, "CHANGELOG.md"), "utf8");

  assert.equal(rootPackage.version, "2.0.0");
  assert.equal(rootPackage.version, hookifyPackage.version);
  assert.equal(rootPackage.version, hookifyManifest.version);
  assert.equal(rootPackage.version, qualityPackage.version);
  assert.equal(rootPackage.version, qualityManifest.version);
  assert.equal(contextPackage.version, contextManifest.version);
  assert.ok(changelog.includes(`## [${rootPackage.version}] - `));
});

test("release bundle includes required scripts and explicit install strategy", () => {
  for (const relativePath of [
    "install.sh",
    "UNINSTALL.sh",
    "scripts/manage-openclaw-config.mjs",
    "openclaw-hooks.config.yaml.example",
    "plugins/hookify-engine/openclaw.plugin.json",
    "plugins/hookify-engine/src/rules/block-dangerous-rm.md",
    "plugins/context-mode/package-lock.json",
  ]) {
    assert.ok(existsSync(resolve(repoRoot, relativePath)), `${relativePath} must exist`);
  }

  accessSync(resolve(repoRoot, "install.sh"), constants.X_OK);
  accessSync(resolve(repoRoot, "UNINSTALL.sh"), constants.X_OK);

  const installScript = readFileSync(resolve(repoRoot, "install.sh"), "utf8");
  assert.match(installScript, /npm .* ci --omit=dev|"\$NPM_CMD" --prefix .* ci --omit=dev/);
  assert.match(installScript, /manage-openclaw-config\.mjs"\s+install/);

  const uninstallScript = readFileSync(resolve(repoRoot, "UNINSTALL.sh"), "utf8");
  assert.match(uninstallScript, /manage-openclaw-config\.mjs"\s+uninstall/);

  const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
  assert.match(readme, /包含三个插件/);
  assert.match(readme, /~\/\.openclaw\/rules\//);
  assert.match(readme, /这个仓库不是单一许可证仓库/);
});

test("ignore rules cover generated artifacts", () => {
  const gitignore = readFileSync(resolve(repoRoot, ".gitignore"), "utf8");
  for (const pattern of ["node_modules/", "*.staged", "*.backup*", "*.log", "*.db"]) {
    assert.match(gitignore, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
