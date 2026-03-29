---
name: check-git-push
enabled: true
event: before_tool_call
priority: 100
severity: warning
action: warn
conditions:
  - field: tool_name
    operator: regex_match
    pattern: exec|bash|terminal
  - field: command
    operator: regex_match
    pattern: \bgit\s+push\b
---

📌 **About to push to remote.**

Quick checklist before pushing:
- Verify the target branch is correct
- Confirm all tests pass
- Review staged changes with `git diff --cached`
