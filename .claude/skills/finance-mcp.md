---
name: finance-data
description: Query live finance tool and tax management data via the project MCP server
---

Use the `get_tax_preview`, `list_tax_documents`, `list_transactions`, `list_lots`,
`get_schedule_c`, `list_payslips`, and related MCP tools to answer questions about the user's
finance and tax data without guessing from source code.

Always prefer these tools over `database-query` when the question is about
user-facing data rather than schema structure.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_tax_preview` | Full tax preview dataset for a year (W-2s, 1099s, cap gains, Form 1116, Schedule C, action items). For payslip data use `list_payslips`. |
| `list_tax_documents` | List tax documents filtered by year, form_type, is_reviewed |
| `get_tax_document` | Single tax document with full parsed_data |
| `list_accounts` | Financial accounts grouped by type |
| `get_account_summary` | Account totals and per-symbol breakdown |
| `list_transactions` | Transactions filtered by account, year, tag, limit |
| `list_lots` | Investment lots as of a given date |
| `get_schedule_c` | Schedule C self-employment summary |
| `list_employment_entities` | W-2 employers and Schedule C businesses |
| `list_tags` | Transaction tags with tax characteristics |
| `get_marriage_status` | Filing status by year |
| `list_payslips` | Payslips filtered by year (or `has_rsu` / `has_bonus`); includes RSU tax offsets, taxable wage bases, PTO balances, per-state tax data (`state_data`), deposit splits (`deposits`), and catch-all `other` |

## Available Resources

| URI | Description |
|-----|-------------|
| `finance://tax-documents/reviewed` | Reviewed tax docs for current year |
| `finance://accounts` | Account list with metadata |
| `finance://employment-entities` | All employment entities |

## MCP Server Registration

### Local dev (stdio — for Claude Code / GitHub Copilot Agent)

Add to your MCP configuration:

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

### Production (HTTP transport)

First generate an MCP API key from the **My Account → MCP API Key** section of the app.
Then configure your MCP client:

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
