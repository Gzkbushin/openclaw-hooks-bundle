#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

assert_json() {
  local file_path="$1"
  local program="$2"
  node --input-type=module - "$file_path" "$program" <<'NODE'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const [, , filePath, program] = process.argv;
const data = JSON.parse(readFileSync(filePath, "utf8"));
const fn = new Function("data", "assert", program);
fn(data, assert);
NODE
}

create_fake_env() {
  local root
  root="$(mktemp -d)"
  local home_dir="$root/home"
  local bin_dir="$root/bin"
  mkdir -p "$home_dir" "$bin_dir"

  cat > "$bin_dir/openclaw" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

  cat > "$bin_dir/npm" <<EOF
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "\$*" >> "$root/npm.log"
prefix=""
prev=""
for arg in "\$@"; do
  if [ "\$prev" = "--prefix" ]; then
    prefix="\$arg"
    prev=""
    continue
  fi
  if [ "\$arg" = "--prefix" ]; then
    prev="--prefix"
  fi
done
if [ -n "\$prefix" ]; then
  mkdir -p "\$prefix/node_modules"
  printf 'smoke\n' > "\$prefix/node_modules/.smoke-installed"
fi
EOF

  chmod +x "$bin_dir/openclaw" "$bin_dir/npm"

  printf '%s\n' "$root"
}

run_install_cycle() {
  local root="$1"
  local home_dir="$root/home"
  local config_path="$home_dir/.openclaw/openclaw.json"
  local extensions_dir="$home_dir/.openclaw/extensions"
  local backup_dir="$extensions_dir/backups"
  local rules_dir="$home_dir/.openclaw/rules"
  mkdir -p "$home_dir/.openclaw"
  printf '{broken-json' > "$config_path"

  HOME="$home_dir" PATH="$root/bin:$PATH" bash "$ROOT_DIR/install.sh" >/dev/null

  assert_json "$config_path" '
    assert.deepEqual(data.plugins.allow.sort(), ["context-mode", "hookify-engine", "openclaw-quality-hooks"]);
    assert.equal(data.plugins.entries["hookify-engine"].enabled, true);
    assert.equal(data.plugins.entries["context-mode"].enabled, true);
    assert.equal(data.plugins.entries["openclaw-quality-hooks"].enabled, true);
  '

  test -f "$extensions_dir/hookify-engine/openclaw.plugin.json"
  test -f "$extensions_dir/context-mode/node_modules/.smoke-installed"
  test -f "$rules_dir/block-dangerous-rm.md"
  grep -Eq '(^| )ci( |$)' "$root/npm.log"
  grep -Eq -- '--omit=dev' "$root/npm.log"
  find "$backup_dir" -type f | grep -q 'openclaw.invalid.'

  printf '# custom\n' > "$rules_dir/custom-rule.md"
  printf 'old\n' > "$extensions_dir/openclaw-quality-hooks/upgrade-marker.txt"
  HOME="$home_dir" PATH="$root/bin:$PATH" bash "$ROOT_DIR/install.sh" >/dev/null
  test ! -f "$extensions_dir/openclaw-quality-hooks/upgrade-marker.txt"
  test -f "$rules_dir/custom-rule.md"
  find "$backup_dir" -type f | grep -q 'hookify-engine'
  find "$backup_dir" -type f | grep -q 'openclaw-quality-hooks'

  node --input-type=module - "$config_path" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const [, , configPath] = process.argv;
const data = JSON.parse(readFileSync(configPath, "utf8"));
data.plugins.allow.push("custom-plugin");
data.plugins.load.paths.push("/tmp/custom-plugin");
data.plugins.entries["custom-plugin"] = { enabled: true };
data.extra = { keep: true };
writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
NODE

  HOME="$home_dir" PATH="$root/bin:$PATH" bash "$ROOT_DIR/UNINSTALL.sh" >/dev/null

  test ! -d "$extensions_dir/hookify-engine"
  test ! -d "$extensions_dir/openclaw-quality-hooks"
  test ! -d "$extensions_dir/context-mode"

  assert_json "$config_path" '
    assert.deepEqual(data.plugins.allow, ["custom-plugin"]);
    assert.deepEqual(data.plugins.load.paths, ["/tmp/custom-plugin"]);
    assert.deepEqual(data.plugins.entries["custom-plugin"], { enabled: true });
    assert.deepEqual(data.extra, { keep: true });
  '
}

run_invalid_uninstall_cycle() {
  local root="$1"
  local home_dir="$root/home"
  local extensions_dir="$home_dir/.openclaw/extensions"
  local config_path="$home_dir/.openclaw/openclaw.json"
  local backup_dir="$extensions_dir/backups"
  mkdir -p "$extensions_dir/hookify-engine" "$extensions_dir/openclaw-quality-hooks" "$extensions_dir/context-mode"
  mkdir -p "$(dirname "$config_path")"
  printf '[1,2,3]\n' > "$config_path"

  HOME="$home_dir" PATH="$root/bin:$PATH" bash "$ROOT_DIR/UNINSTALL.sh" >/dev/null

  test ! -d "$extensions_dir/hookify-engine"
  test ! -d "$extensions_dir/openclaw-quality-hooks"
  test ! -d "$extensions_dir/context-mode"
  find "$backup_dir" -type f | grep -q 'openclaw.invalid.'

  assert_json "$config_path" '
    assert.ok(Array.isArray(data.plugins.allow));
    assert.ok(Array.isArray(data.plugins.load.paths));
  '
}

ROOT_ONE="$(create_fake_env)"
ROOT_TWO="$(create_fake_env)"
trap 'rm -rf "$ROOT_ONE" "$ROOT_TWO"' EXIT

run_install_cycle "$ROOT_ONE"
run_invalid_uninstall_cycle "$ROOT_TWO"

echo "install lifecycle smoke test passed"
