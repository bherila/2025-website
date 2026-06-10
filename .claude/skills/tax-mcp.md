---
name: tax-reconciliation
description: Compare a locally-read CPA return against live Tax Preview data via the project tax MCP server
---

Use the `/mcp/tax` MCP server (or `POST /api/agent/v1/tax/preview/{year}/compare-return-lines`)
to reconcile a CPA-prepared return against the app's Tax Preview without uploading the return.

**Hard rule: never upload the CPA return PDF.** Read it locally, extract
`{form, line, label, amount_cents}` rows, and submit only those numbers. The server compares
them transiently — no documents are stored and nothing is mutated.

## Available Tools

| Tool | Description |
|------|-------------|
| `tax_compare_return_lines` | Compare submitted return lines against Tax Preview facts for a year; returns matched/different/missing summary + per-line discrepancies keyed by `TaxFactRouting` ids (e.g. `form_1040_line_1z`) |
| `get_tax_preview` | Full tax preview dataset for a year, including `taxFacts` source-line breakdowns for drilling into discrepancies |

Notes:

- Amounts are **integer cents**; `matched` means |delta| ≤ `tolerance_cents` (default suggestion: 100).
- Form names are normalized (`1040`, `Schedule D`, `Sch D`, `8949` all work); unknown lines come back as `unmatched_input`, never an error.
- Prefer TOON (`Accept: text/toon`, `Content-Type: text/toon`) for line tables — far fewer tokens than JSON.

## MCP Server Registration

Easiest: the **Agent Access (AI clients)** card on the **Tax Preview** page — **Copy Claude setup**
issues a temporary 4-hour `tax`-scoped token and copies this config with the token embedded:

```json
{
  "mcpServers": {
    "bh-tax": {
      "url": "https://your-domain.com/mcp/tax",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

`tools/list` is filtered by user permissions and token scope; hidden tools are uninvokable.
Full docs: `docs/finance/tax-reconciliation-agent.md` and `docs/agent-access.md`.
