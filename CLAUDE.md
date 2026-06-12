# CLAUDE.md

@AGENTS.md

## Claude Code overlay

This file is intentionally small. `AGENTS.md` is the cross-agent source of truth for architecture, commands, validation, migrations, money math, privacy, and Laravel Boost guidance.

- Read `.github/copilot-instructions.md` only when you need implementation history or a pattern not covered by `AGENTS.md`.
- Prefer targeted context: `git diff --name-only`, `rg`, relevant tests, and neighboring files before broad scans.
- Use subagents or worktree isolation only for independent high-volume exploration or parallel implementation; require concise findings and changed-file summaries.
- Use Laravel Boost `search-docs` before changing Laravel ecosystem behavior when the tool is available.
- Follow the migration/schema-dump prohibition and currency.js money-math rules from `AGENTS.md`.
- Before pushing or handing off, run the affected-stack gates from `AGENTS.md` / `TESTING.md`; if a PR exists, check CI and fix red checks rather than leaving them for the user.
- See `TOKEN_EFFICIENCY_NOTES.md` for recommended follow-up context-structure improvements (path-scoped rules, split TESTING docs) that would further reduce always-loaded token cost.
