---
name: block-unsafe-editor-exit
enabled: true
event: before_tool_call
priority: 840
severity: error
action: block
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "exec|bash|terminal"
  - field: command
    operator: regex_match
    pattern: ":\\q!(\\s|$)"
---

🛑 **Unsafe editor exit blocked!**

The `:q!` command force-quits Vim without saving, which can lead to
accidental data loss when used in non-interactive contexts.

**Why this is blocked:**
- In scripted or tool-invoked Vim sessions, `:q!` discards all changes
- Could cause partial edits to be lost
- Often indicates a mistake in the editor workflow

**Safe alternatives:**
- Use `:wq` to save and quit
- Use `:x` to save and quit (only writes if modified)
- Use `ZZ` as a shortcut for save-and-quit
