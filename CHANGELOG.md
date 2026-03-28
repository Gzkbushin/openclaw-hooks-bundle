# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-03-28

### Added
- **hookify-engine**: New declarative markdown-based rule engine plugin
  - YAML frontmatter rule definitions with hot-reload
  - 10 built-in default rules (dangerous commands, debug code, sensitive files, etc.)
  - Rule engine with LRU regex caching (256 entries)
  - Support for 8 condition operators (regex_match, contains, equals, not_contains, starts_with, ends_with, glob_match, not_regex_match)
  - Priority-based rule evaluation (0-1000)
  - Severity levels (error, warning, info)
  - Actions: warn, block, log, allow
  - Zero external dependencies
- `install.sh` now creates `~/.openclaw/rules/` directory and installs built-in rules
- Built-in rules are only installed when the rules directory is empty (preserves user customizations)
- `UNINSTALL.sh` now also removes hookify-engine plugin

### Changed
- **openclaw-quality-hooks** now delegates rule evaluation to hookify-engine when available
- `danger-blocker` and `console-log-audit` are now powered by declarative rules via hookify-engine
- Built-in hooks maintained as automatic fallback when hookify-engine is unavailable
- `scripts/manage-openclaw-config.mjs` now registers hookify-engine in the plugins configuration
- Plugin version bumped to 2.0.0 across all affected files

### Deprecated
- `danger-blocker.ts` direct usage — use hookify-engine rules instead (retained for backward compatibility)
- `console-log-audit.ts` direct usage — use hookify-engine rules instead (retained for backward compatibility)

### Security
- All hookify-engine rule evaluation is wrapped in safe error handling to prevent single rule failures from affecting overall plugin operation

---

## [1.1.0] - 2026-03-22

### Added
- Dangerous command interception and audit logging
- Smart reminders, auto-formatting, and background quality checking
- Layered configuration loading with basic schema validation
- All hooks isolated with safe error handling to prevent single-point failures

### Added — context-mode
- Tool call event persistence
- Session snapshot construction and restoration
- FTS5 + BM25 retrieval for compression assistance
- Sensitive data masking and resource cleanup policies
