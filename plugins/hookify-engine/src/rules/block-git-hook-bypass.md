---
name: block-git-hook-bypass
enabled: true
event: before_tool_call
priority: 850
severity: error
action: block
conditions:
  - field: tool_name
    operator: regex_match
    pattern: "exec|bash|terminal"
  - field: command
    operator: regex_match
    pattern: "--no-verify"
---

🛑 **Git hook bypass blocked!**

The `--no-verify` flag skips pre-commit and pre-push hooks,
bypassing important safety checks like linting, formatting, and tests.

**Why this is dangerous:**
- Skips linting checks (ESLint, Biome, Ruff)
- Skips test execution
- Skips custom validation hooks
- Could allow buggy or insecure code into the repository

**What to do instead:**
- Fix the hook that is failing rather than bypassing it
- If temporarily needed, use `git commit --no-verify` only with explicit approval
