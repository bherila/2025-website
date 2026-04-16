# Finance MCP Server

The finance module ships a project-specific **Model Context Protocol (MCP) server** (`App\Mcp\Servers\Finance`) that exposes live finance and tax data to AI coding agents (Claude Code, GitHub Copilot, etc.) without them having to guess from source code alone.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `get_tax_preview` | Full tax preview dataset for a year (W-2s, 1099s, cap gains, Form 1116, Schedule C, action items). For payslip data use `list_payslips`. |
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

## Available Resources

| URI | Description |
|-----|-------------|
| `finance://tax-documents/reviewed` | Reviewed tax docs for the current year |
| `finance://accounts` | Account list with metadata |
| `finance://employment-entities` | All employment entities |

---

## Authentication (Production / HTTP Transport)

The HTTP route (`POST /mcp/finance`) requires an `Authorization: Bearer <token>` header. The token is matched against the `mcp_api_key` column on the `users` table via the `AuthenticateMcpRequest` middleware.

**Generating a key:** Users navigate to **My Account** → **MCP API Key** section and click **Generate MCP API Key**. The key is shown once. A subsequent click **regenerates** the key, immediately invalidating the old one.

**No shared secret / env var is used.** Each user has their own per-user key that can be rotated without a deploy.

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

Generate an MCP API key from My Account, then:

```json
{
  "mcpServers": {
    "bh-finance": {
      "url": "https://your-domain.com/mcp/finance",
      "headers": {
        "Authorization": "Bearer <your-mcp-api-key>"
      }
    }
  }
}
```

## GitHub Copilot Coding Agent (Remote Access)

The GitHub Copilot Coding Agent runs in a sandboxed cloud environment and can reach the production HTTP MCP endpoint over HTTPS. To enable:

1. **Generate a key** on the Settings page (My Account → MCP API Key).
2. **Store it as a GitHub Actions secret** — e.g. `MCP_BH_FINANCE_API_KEY`.
3. **Configure the agent** in `.github/copilot-instructions.md` or the Copilot settings to use the MCP server with the bearer token injected from the secret.

> **Note**: The Copilot cloud agent cannot reach `localhost`. Always point it at the production HTTPS URL.

---

## Skill File

A Claude Code skill definition is at `.claude/skills/finance-mcp.md`. This registers the finance MCP tools in the Claude Code slash-command palette under the `finance-data` skill.
