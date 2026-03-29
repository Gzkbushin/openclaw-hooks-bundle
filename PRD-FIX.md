# Fix plugin runtime compatibility (Round 3)

## Prior Progress
Task 1 (hookify-engine) was completed in a previous Codex session.
Commit: `ab95cac fix(hookify-engine): export plain plugin entry`.

## Problem
3 plugins fail to load in OpenClaw runtime:
1. `api.registerHook({ event, handler })` object form — WRONG; use `api.on(event, handler, {priority})`
2. Top-level `await import(...)` — NOT supported by OpenClaw runtime
3. `createRequire` from `node:module` — breaks `--experimental-strip-types`
4. `definePluginEntry` — use plain object export instead

## Official docs
- https://docs.openclaw.ai/plugins/building-plugins
- https://docs.openclaw.ai/plugins/manifest

## Tasks

- [x] ~~Fix plugins/hookify-engine/index.ts~~ — DONE in previous session
- [x] Fix plugins/openclaw-quality-hooks/index.ts: remove top-level await, switch all hook registrations from `api.registerHook({event, handler})` to `api.on(event, handler, {priority})` positional form, use `globalThis.__hookifyEngineHooks` for hookify-engine integration (NO cross-plugin imports), keep all existing functional logic, export plain object (NOT definePluginEntry)
- [x] Fix plugins/context-mode/index.ts: remove `createRequire` from `node:module`, switch all `api.registerHook({event, handler})` to `api.on(event, handler, {priority})` positional form, do NOT modify functional logic (~800 lines), ONLY change plugin wrapper and hook registration calls, export plain object (NOT definePluginEntry)
- [x] Fix plugins/context-mode/package.json: change `name` from `"context-mode-openclaw"` to `"context-mode"`
- [ ] Clean all 3 `openclaw.plugin.json` manifest files: keep only `id`, `name`, `description`, `version`, `configSchema`; remove `hooks`, `tools`, `author`, `license`, `homepage`, `capabilities`
- [ ] Fix all test mocks in `plugins/openclaw-quality-hooks/test/hooks.test.ts`, `error-handling.test.ts`, `plugins/context-mode/test/plugin-entry.test.ts`, `resource-management.test.ts`: change `registerHook({event,handler})` to `on(event, handler, opts)` or `registerHook(event, handler, opts)`
- [ ] Run all tests: `node --experimental-strip-types --test plugins/hookify-engine/test/*.test.ts plugins/openclaw-quality-hooks/test/*.test.ts plugins/context-mode/test/*.test.ts` — target 125 tests
- [ ] Verify: `grep -rn "^await " plugins/*/index.ts` should return nothing
- [ ] Verify: `grep -rn "createRequire" plugins/*/index.ts` should return nothing
- [ ] Verify: `grep -rn "definePluginEntry" plugins/*/index.ts` should return nothing
- [ ] Verify: `grep -rn "registerHook({" plugins/*/index.ts` should return nothing
- [ ] Copy fixed files to /root/.openclaw/extensions/ counterparts

## Critical constraints
- NO top-level `await import(...)`
- NO `createRequire` from `node:module`
- NO `require()` in ESM
- NO `api.registerHook({...})` object form — use positional `api.on(event, handler, {priority})`
- NO `definePluginEntry` — export plain object
- NO cross-plugin imports
- All code must work with `node --experimental-strip-types`
- Do NOT modify files outside `/tmp/openclaw-hooks-bundle/` (except Task 12 copy step)
- Do NOT modify OpenClaw configuration files
