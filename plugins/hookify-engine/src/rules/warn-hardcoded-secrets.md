---
name: warn-hardcoded-secrets
enabled: true
event: after_tool_call
priority: 250
severity: warning
action: warn
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "edit|write"
  - field: file_path
    operator: ends_with
    pattern: ".ts"
  - field: new_text
    operator: regex_match
    pattern: "(API_KEY|SECRET|TOKEN|PASSWORD)\\s*=\\s*[\\'\"]"
---

🔐 **Hardcoded credential detected in TypeScript!**

Sensitive values should never be hardcoded in source files.
Use environment variables or a secrets manager instead.

**Detected pattern:**
Assignments like `API_KEY = '...'`, `SECRET = "..."`, `TOKEN = '...'`, or `PASSWORD = "..."`

**Secure alternatives:**
- Use `process.env.API_KEY` (Node.js)
- Use `import.meta.env.VITE_API_KEY` (Vite)
- Use a secrets manager (AWS Secrets Manager, HashiCorp Vault)
- Use `.env` files (never committed to git)
