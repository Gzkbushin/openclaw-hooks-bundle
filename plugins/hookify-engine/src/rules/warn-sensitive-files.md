---
name: warn-sensitive-files
enabled: true
event: before_tool_call
priority: 300
severity: warning
action: warn
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "edit|write"
  - field: file_path
    operator: regex_match
    pattern: "\\.env$|credentials|secrets"
  - field: new_text
    operator: contains
    pattern: "KEY"
---

🔐 **Sensitive file edit detected!**

You are editing a file that may contain sensitive information.

**Precautions:**
- Ensure no secrets are committed to version control
- Use `.gitignore` to exclude sensitive files
- Consider using environment variable templates (`.env.example`)
- Never hardcode API keys, passwords, or tokens
