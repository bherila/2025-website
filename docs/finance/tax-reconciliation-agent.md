# Tax Return Reconciliation — Agent Access

The Tax module lets a **local** AI agent reconcile a CPA-prepared return against this app's Tax Preview, line by line, without the return ever leaving your machine. This doc covers what the agent can do, how to connect one, and the privacy guarantees. For the overall token model, capability-filtered discovery, and TOON content negotiation, see [docs/agent-access.md](../agent-access.md).

---

## The CPA return PDF is never uploaded

This is the core design rule of the feature:

- There is **no file upload field** anywhere in the tax reconciliation surface.
- CPA-prepared returns are **never stored** server-side and are **not** a tax-document type.
- Your local agent reads the PDF locally and extracts only `{form, line, label, amount_cents}` tuples; the server compares those numbers against your Tax Preview **transiently** — no `fin_tax_documents` or `fin_documents` rows are created, nothing is mutated.

## What the agent can do

With a `tax`-scoped agent token (permission `finance.tax-preview.view`):

```text
POST /api/agent/v1/tax/preview/{year}/compare-return-lines
```

Request (JSON or TOON):

```json
{
  "return_type": "cpa_prepared_1040",
  "tolerance_cents": 100,
  "lines": [
    {"form": "1040", "line": "1z", "label": "Wages", "amount_cents": 12345600}
  ]
}
```

Response:

```json
{
  "year": 2024,
  "summary": {"matched": 8, "different": 2, "missing_in_preview": 1, "missing_in_return": 0, "unmatched_input": 0},
  "discrepancies": [
    {"key": "form_1040_line_1z", "form": "1040", "line": "1z",
     "return_amount_cents": 12345600, "preview_amount_cents": 12340000,
     "delta_cents": 5600, "severity": "review"}
  ]
}
```

Notes on matching:

- Canonical comparison keys are the `TaxFactRouting` enum values (e.g. `form_1040_line_1z`, `schedule_d_line_16`); form names are normalized (`"1040"`, `"Schedule D"`, `"Sch D"`, `"8949"` all map correctly), and unrecognized lines are reported under `unmatched_input` rather than failing the request.
- `matched` means |delta| ≤ `tolerance_cents`; all amounts are integer cents.
- Preview lines absent from your submitted return only appear as the `missing_in_return` summary count — the endpoint never dumps your full preview.

The broader tax read surface (full preview dataset, tax documents with `parsed_data`, Schedule C, employment entities) is available under the same `tax` module scope — see the module manifest at `GET /api/agent/v1/tax/capabilities[.toon]`.

### MCP

A minimal MCP server is mounted at `POST /mcp/tax` (bearer auth) exposing `tax_compare_return_lines` (and the tax-preview read tools available to your scope). `tools/list` is filtered per user and token scope; hidden tools are also uninvokable.

---

## Copy-paste setup

1. Log in and open **Finance → Tax Preview**.
2. Use the **Agent Access (AI clients)** card at the bottom of the dock home view:
   - **Copy Claude setup** — issues a temporary 4-hour `tax`-scoped token and copies an MCP client config (token embedded) for `~/.config/claude/mcp.json` / `.mcp.json`.
   - **Copy REST/TOON setup** — copies a curl snippet against `GET /api/agent/v1/tax/capabilities.toon` with `Accept: text/toon`.
3. Manage or revoke tokens any time from **My Account → Agent API Tokens**.

The token scope is the intersection of the `tax` module's permission list (`finance.access`, `finance.tax-preview.*`, `finance.tax-documents.*`) and your own effective permissions.

## Local-reconciliation prompt guidance (prefer TOON)

Have your agent do the extraction locally and speak [TOON](https://github.com/toon-format/toon) in both directions (`Content-Type: text/toon`, `Accept: text/toon`) — line tables are exactly the tabular shape TOON compresses best, so more of the return fits in context. A good prompt:

> Read `~/Documents/2024-return.pdf` locally (do NOT upload it anywhere). Extract every Form 1040, Schedule 1/2/3, Schedule A/B/D/E, and Form 8949/4952/8960 line that has a non-zero amount as `{form, line, label, amount_cents}` rows. POST them as TOON to `/api/agent/v1/tax/preview/2024/compare-return-lines` with `tolerance_cents: 100`, then walk me through each discrepancy: which source documents in Tax Preview feed that line, and whether the CPA's number or the preview looks right.

Useful follow-ups for the agent: `get_tax_preview` (the `taxFacts` array carries per-line source breakdowns keyed by the same routing ids the comparison returns) and `list_tax_documents` / `get_tax_document` to inspect the underlying W-2/1099/K-1 `parsed_data`.
