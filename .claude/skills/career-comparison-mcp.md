---
name: career-comparison-data
description: Read and edit Career Comparison scenarios via the project career-comparison MCP server
---

Use the `/mcp/career-comparison` MCP server (or the REST surface under
`/api/agent/v1/career-comparison/...`) to work with job-offer comparison scenarios.

## Available Tools

| Tool | Description |
|------|-------------|
| `career_get_public_share` | Read a public share by code (creator redaction applied; expired/unknown → not found) |
| `career_get_latest_comparison` | Read the user's private latest scenario |
| `career_save_latest_comparison` | Save the user's private latest scenario |
| `career_import_rsu` | Import current RSU grants from the finance module (requires `finance.rsu.view`) |

Notes:

- Anonymous access is **read-only**: public share read + stateless compute. Share editing via
  the agent API requires a token and `financial-planning.career-comparison.private`; the web
  app's anyone-with-the-link share editing is deliberately not exposed here.
- Prefer TOON (`Accept: text/toon`) — vesting/cash-flow projections are tabular and compress well.
- No documents are ever uploaded through this surface (offer letters stay local).

## MCP Server Registration

Easiest: the **Agent access** card on the **Career Comparison** page — **Copy Claude setup**
issues a temporary 4-hour `career-comparison`-scoped token and copies this config with the
token embedded:

```json
{
  "mcpServers": {
    "bh-career-comparison": {
      "url": "https://your-domain.com/mcp/career-comparison",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

`tools/list` is filtered by user permissions and token scope; hidden tools are uninvokable.
Full docs: `docs/financial-planning/career-comparison-agent.md` and `docs/agent-access.md`.
