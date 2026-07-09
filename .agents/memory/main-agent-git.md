---
name: Main agent git restrictions
description: git commit / destructive git ops are blocked when run directly as the main agent; how to still get code onto an external remote like GitHub.
---

Running `git commit`, `git push --force`, `git reset`, etc. directly via the bash tool as the main agent is blocked by the sandbox ("Destructive git operations are not allowed in the main agent").

**Why:** The platform itself automatically creates a git commit (and checkpoint) at the end of every agent turn, before returning control to the user. Manually committing mid-turn would conflict with that lifecycle, so it's disallowed.

**How to apply:**
- Don't try to `git commit` yourself — just finish the turn; the commit happens automatically afterward.
- If the project needs to be pushed to an external remote (e.g. GitHub, for a CI/CD pipeline to a self-hosted VPS), that push must happen in a *later* turn/tool call, after the automatic commit has landed — check `git log` to confirm your changes are committed before attempting `git push`.
- Pushing to GitHub from the Replit shell requires credentials; if the user has no CLI git credentials configured, request a Personal Access Token (with `repo` + `workflow` scopes if pushing workflow files) via the environment-secrets flow, then push with `git push https://${TOKEN}@github.com/<org>/<repo>.git HEAD:main` using the `bash` tool (not `code_execution`, since secrets aren't populated in that sandbox's `process.env`).
