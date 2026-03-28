---
name: block-dangerous-rm
enabled: true
event: before_tool_call
priority: 900
severity: error
action: block
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "exec|bash|terminal"
  - field: command
    operator: regex_match
    pattern: "\\brm\\s+-[^\\n]*[rf][^\\n]*\\b"
---

🛑 **Dangerous rm command detected!**

This command could permanently delete files.
Operation is blocked for safety. Use `approved: true` to override.

**Examples of blocked patterns:**
- `rm -rf /important/path`
- `rm -fr /tmp/stuff`
- `rm -r -f ./src`

**Safe alternatives:**
- Use `rm -i` for interactive deletion
- Use trash utilities instead
- Verify the target path before deleting
