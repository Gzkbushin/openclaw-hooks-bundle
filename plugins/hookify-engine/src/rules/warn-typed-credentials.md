---
name: warn-typed-credentials
enabled: true
event: before_tool_call
priority: 600
severity: warning
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.tsx?$|\.jsx?$
  - field: new_text
    operator: regex_match
    pattern: (password|passwd|token|api[_-]?key|secret|credential)\s*[:=]\s*["'][^"']{8,}
---

⚠️ **Possible hardcoded credentials in TypeScript/JavaScript file!**

Ensure secrets are loaded from environment variables or a secrets manager, not hardcoded in source.
