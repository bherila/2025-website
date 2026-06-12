# Token-efficiency notes for 2025-website

This repo already has strong operational rules, worktree hooks, CI path filters, and domain-specific gotchas. The main improvement is reducing always-loaded context.

Recommended follow-up structure:

```text
AGENTS.md                         # compact cross-agent contract, <200 lines
CLAUDE.md                         # Claude Code entrypoint importing AGENTS.md
TESTING.AGENTS.md                 # routine agent gate
TESTING.HUMANS.md                 # e2e, exploratory, manual runbooks
.claude/rules/backend.md          # PHP/Laravel rules, path-scoped
.claude/rules/frontend.md         # React/Tailwind rules, path-scoped
.claude/rules/finance.md          # finance/currency/tax/lots rules, path-scoped
.claude/rules/client-management.md# client-management billing/PII rules, path-scoped
```

Avoid keeping the same Laravel Boost block in both `AGENTS.md` and `CLAUDE.md`. Claude Code imports organize context but do not reduce loaded tokens, so use path-scoped rules for token savings rather than large root files.
