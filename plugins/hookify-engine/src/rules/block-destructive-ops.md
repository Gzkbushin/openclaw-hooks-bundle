---
name: block-destructive-ops
enabled: true
event: before_tool_call
priority: 890
severity: error
action: block
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "exec|bash|terminal"
  - field: command
    operator: regex_match
    pattern: "dd\\s+if=|mkfs\\.|\\bformat\\s|chmod\\s+777"
---

🛑 **Destructive operation detected!**

This command could cause irreversible data loss or security issues.
Operation is blocked for safety.

**Blocked operations:**
- `dd if=...` — Low-level disk write, can destroy partitions
- `mkfs.*` — Format filesystem, erases all data
- `format` — Format disk or partition
- `chmod 777` — Overly permissive file permissions

**Safe alternatives:**
- Use `chmod 755` or `chmod 644` for appropriate permissions
- Double-check disk operations before execution
