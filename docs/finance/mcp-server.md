# Finance MCP Server

The finance module ships a project-specific **Model Context Protocol (MCP) server** (`App\Mcp\Servers\Finance`) that exposes live finance and tax data to AI coding agents (Claude Code, GitHub Copilot, etc.) without them having to guess from source code alone.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `get_tax_preview` | Full tax preview dataset for a year (W-2s, 1099s, cap gains, Form 1116, Schedule C, action items, and backend `taxFacts` source lines). For payslip data use `list_payslips`. |
| `list_tax_documents` | List tax documents filtered by `year`, `form_type`, `is_reviewed` |
| `get_tax_document` | Single document by ID, including full `parsed_data` |
| `list_accounts` | Financial accounts grouped into asset / liability / retirement |
| `get_account_summary` | Account totals and per-symbol breakdown |
| `list_transactions` | Transactions filtered by `account_id`, `year`, `tag`, `limit` (max 500) |
| `list_lots` | Investment lots held `as_of` a date; optionally filter by `account_id` |
| `get_schedule_c` | Schedule C self-employment summary from `ScheduleCSummaryService` |
| `list_employment_entities` | All employment entities |
| `list_tags` | Transaction tags with tax characteristics |
| `get_marriage_status` | Filing status by year |
| `list_payslips` | Payslips filtered by `year`; returns all fields (earnings, taxes, deductions, 401k) |

`get_tax_preview.taxFacts` is the agent-friendly audit trail for the highest-value tax debug paths. It currently includes Form 1040, Schedule 1, Schedule A, Schedule B, Schedule D, Schedule E, Form 1116, Form 4952, Form 8949, and Form 8960 backend facts. Capital gains come from the PHP wash-sale/report builder; Form 1040 and Schedule A/E/1116/8960 facts expose K-1/K-3 and user-entered source lines for review. The same data is available from the CLI via `php artisan finance:tax-preview-facts`. Each fact source includes `isReviewed`, `reviewStatus`, and `reviewAction`; agents should call out `needs_review` sources as estimates rather than silently treating them as final.

## Available Resources

| URI | Description |
|-----|-------------|
| `finance://tax-documents/reviewed` | Reviewed tax docs for the current year |
| `finance://accounts` | Account list with metadata |
| `finance://employment-entities` | All employment entities |

---

## Authentication (Production / HTTP Transport)

The HTTP route (`POST /mcp/finance`) requires an `Authorization: Bearer <token>` header. Two kinds of bearer token are accepted:

1. **Agent setup tokens (recommended)** — temporary, Finance-scoped tokens (`bha_…`, 4-hour default) issued by the **Agent Access (AI clients)** card on the Finance Config page. Clicking **Copy Claude setup** issues a token and copies an MCP client config with the token embedded; manage or revoke tokens from **My Account → Agent API Tokens**. See [docs/agent-access.md](../agent-access.md) for the full token model, scoping rules, and the REST/TOON surface.
2. **Legacy per-user MCP API key** — matched against the `mcp_api_key` column on the `users` table. Generate from **My Account → MCP API Key** (shown once; regenerating invalidates the old one). Legacy keys are unscoped and follow the user's live permissions.

In both cases a matching token is not enough by itself: the associated user must also pass `User::canLogin()`, so disabled users or users with all login roles removed receive the same generic `401 Unauthorized` response as invalid tokens. Tool visibility (`tools/list`) and invocation are additionally filtered by the user's feature permissions and, for agent tokens, by the token's module scope.

**No shared secret / env var is used.** Each user has their own per-user tokens that can be rotated without a deploy.

---

## Local Development (stdio Transport)

For Claude Code / GitHub Copilot Coding Agent in local dev, add to your MCP client config (e.g. `~/.config/claude/mcp.json` or `.vscode/mcp.json`):

```json
{
  "mcpServers": {
    "bh-finance": {
      "command": "php",
      "args": ["artisan", "mcp:start", "finance"],
      "cwd": "/path/to/2025-website"
    }
  }
}
```

## Production (HTTP Transport)

The easiest path is the **Agent Access (AI clients)** card on the Finance Config page — **Copy Claude setup** generates this config for you with a temporary Finance-scoped token already embedded. To configure manually (with either an agent setup token or a legacy MCP API key):

```json
{
  "mcpServers": {
    "bh-finance": {
      "url": "https://your-domain.com/mcp/finance",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

A checked-in example client config covering both transports is at [`.mcp.example.json`](../../.mcp.example.json).

## GitHub Copilot Coding Agent (Remote Access)

The GitHub Copilot Coding Agent runs in a sandboxed cloud environment and can reach the production HTTP MCP endpoint over HTTPS. To enable:

1. **Generate a key** on the Settings page (My Account → MCP API Key).
2. **Store it as a GitHub Actions secret** — e.g. `MCP_BH_FINANCE_API_KEY`.
3. **Configure the agent** in `.github/copilot-instructions.md` or the Copilot settings to use the MCP server with the bearer token injected from the secret.

> **Note**: The Copilot cloud agent cannot reach `localhost`. Always point it at the production HTTPS URL.

---

## Skill File

A Claude Code skill definition is at `.claude/skills/finance-mcp.md`. This registers the finance MCP tools in the Claude Code slash-command palette under the `finance-data` skill.
