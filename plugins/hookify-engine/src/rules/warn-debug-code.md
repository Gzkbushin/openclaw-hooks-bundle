---
name: warn-debug-code
enabled: true
event: after_tool_call
priority: 200
severity: warning
action: warn
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "edit|write"
  - field: new_text
    operator: regex_match
    pattern: "console\\.log\\(|debugger;|print\\("
---

🐛 **Debug code detected!**

Debugging statements were found in the code. These should be removed
before committing to the repository.

**Detected patterns:**
- `console.log(...)` — JavaScript/TypeScript debug logging
- `debugger;` — JavaScript/TypeScript breakpoint statement
- `print(...)` — Python debug print statement

**Best practices:**
- Remove all `console.log` before committing
- Use proper logging libraries (e.g., `pino`, `winston`)
- Replace `print()` with proper logging in Python
- Never commit `debugger;` statements
