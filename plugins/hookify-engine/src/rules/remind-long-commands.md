---
name: remind-long-commands
enabled: true
event: before_tool_call
priority: 50
severity: info
action: warn
conditions:
  - field: tool_name
    operator: regex_match
    pattern: exec|bash|terminal
  - field: command
    operator: regex_match
    pattern: (npm install|yarn install|pnpm install|pip install|cargo build|make\s+(?:-j|all)|docker\s+(?:build|compose\s+up))\b
---

⏱️ **Potentially long-running command detected.**

This command may take a while to complete. Consider using a background process if available.
