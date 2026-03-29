# Changelog

## [1.0.0] - 2026-03-29

### Added
- **hookify-engine**: Declarative markdown-based rule engine plugin
  - YAML frontmatter rule definitions with hot-reload
  - 10 built-in default rules (dangerous commands, debug code, sensitive files, etc.)
  - Rule engine with LRU regex caching (256 entries)
  - Support for 8 condition operators
  - Priority-based rule evaluation (0-1000)
  - Severity levels and actions (warn, block, log, allow)
  - Zero external dependencies
- **openclaw-quality-hooks**: Safety, formatting, reminders, and quality gate hooks
  - Dangerous command interception with audit logging
  - Smart reminders for long commands and git push
  - Auto-formatting (Prettier / Biome / Ruff)
  - Async quality gate (tsc + eslint background check)
  - Hookify-engine integration with automatic fallback
- **context-mode**: Privacy-first context optimization
  - SQLite + FTS5 persistent event storage
  - Session resume with context snapshot injection
  - Cross-session semantic search
  - Sensitive data redaction (API keys, JWT, AWS secrets)
  - Resource management with FIFO cleanup

### Changed
- All plugins use `api.on(event, handler, {priority})` positional form
- Plain object exports (no `definePluginEntry` dependency)
- No top-level await, no `createRequire` — fully compatible with `--experimental-strip-types`
