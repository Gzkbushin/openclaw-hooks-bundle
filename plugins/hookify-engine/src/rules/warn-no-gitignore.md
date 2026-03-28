---
name: warn-no-gitignore
enabled: true
event: after_tool_call
priority: 180
severity: warning
action: warn
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "write"
  - field: file_path
    operator: regex_match
    pattern: "\\.env(\\.\\w+)?$|credentials|secret|\\.pem$|\\.key$"
---

⚠️ **Sensitive file created!**

A potentially sensitive file was just created. Ensure it is added to `.gitignore`
to prevent accidental commits of secrets.

**Sensitive file patterns:**
- `.env`, `.env.local`, `.env.production` — Environment variables
- `credentials*` — Credential files
- `*secret*` — Secret key files
- `*.pem` — Certificate files
- `*.key` — Private key files

**Actions:**
1. Add the file to `.gitignore` immediately
2. Check if the file was already staged: `git status`
3. If accidentally committed, remove from history: `git rm --cached <file>`
4. Rotate any secrets that may have been exposed
