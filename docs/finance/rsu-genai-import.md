# RSU GenAI Import — Spec (proposed)

> **Status: not implemented.** This document is a forward-looking spec for an
> AI-driven import path for RSU grants and vest confirmations. The current
> implementation supports manual entry and clipboard-paste import only — see
> [rsu.md](rsu.md). Tracking issue: TBD.

## Goal

Let users upload an RSU grant letter or vest-confirmation PDF and produce one
or more rows that match the existing `IAward` interface (`resources/js/types/finance/rsu.ts`):

```typescript
interface IAward {
  id?: number
  award_id?: string
  grant_date?: string   // YYYY-MM-DD
  vest_date?: string    // YYYY-MM-DD
  share_count?: number
  symbol?: string
  vest_price?: number   // price per share at vest_date (optional)
  grant_price?: number  // price per share at grant_date (optional)
}
```

Each PDF typically describes one grant containing many vest tranches, so a
single document usually produces N `IAward` rows (one per vest_date).

## Proposed wiring

Follow the standard pattern documented in [genai-import.md § Adding a new job type](../genai-import.md#adding-a-new-job-type).

### 1. Job type

Add `equity_award` (final name TBD) to:

- `app/GenAiProcessor/Models/GenAiImportJob.php::VALID_JOB_TYPES`
- `resources/js/genai-processor/types.ts::GenAiJobType`

### 2. Context schema

Most fields are inside the document, so context is light:

| Key              | Required | Description |
|------------------|----------|-------------|
| `default_symbol` | optional | Ticker to apply if the document does not name one (often the employer's stock) |
| `file_count`     | optional | Mirrors other file-based job types |

Register the allowed keys in `GenAiJobDispatcherService::validateContext()`.

### 3. Prompt template

New `EquityAwardPromptTemplate` under `app/GenAiProcessor/Services/Prompts/`.
Asks the model to extract a TOON array, one entry per vest tranche:

```
{award_id, grant_date, vest_date, share_count, symbol, vest_price?, grant_price?}
```

**Open question:** TOON array vs a per-grant tool call (`addEquityAward`) that
contains a nested `vests[]` array. The tool-call shape mirrors
`finance_transactions` and would give us schema-validated output, but it
duplicates the grant-level fields per call. Decide during implementation.

### 4. Result emission

`ParseImportJob::createResults()` adds a `case 'equity_award'` branch that
creates one `GenAiImportResult` **per vest tranche** (not per grant). This
keeps the review UI granular — users can confirm or skip individual vests
when, e.g., they already entered an early-vested tranche manually.

### 5. Persist endpoint

Add `POST /api/rsu/genai-import/{jobId}/results/{resultId}/confirm` on
`FinanceRsuController`. Body: the (possibly user-edited) `IAward` payload.

Behavior:

- Verify `genai_import_jobs.user_id === auth user`.
- Use the existing `updateOrInsert` semantics from `POST /api/rsu` (unique key: `grant_date + award_id + vest_date + symbol`) so re-running an import for a grant already partially entered manually is safe.
- Mark the `GenAiImportResult` imported and the parent job when no `pending_review` rows remain.

Also add a `skip` endpoint symmetric to utility bill, for tranches the user
doesn't want to import.

### 6. Frontend

New modal under `resources/js/components/rsu/`:

- `RsuImportModal.tsx` — orchestrates per-file uploads via `useGenAiFileUpload({ jobType: 'equity_award' })` and renders in-flight job cards.
- `RsuImportJobCard.tsx` — one job's polling via `useGenAiJobPolling` + per-result review form. Editable fields: `award_id`, `grant_date`, `vest_date`, `share_count`, `symbol`, optional `vest_price` / `grant_price`.

Wire into `ManageAwardsPage.tsx` as a sibling button to the existing **Add
Grant** action.

### 7. De-duplication

Two layers of dedup keep duplicate imports safe:

- `GenAiImportJob.file_hash` short-circuits re-uploads of the same PDF (handled by the shared pipeline).
- `fin_equity_awards` unique constraint on `(grant_date, award_id, vest_date, symbol)` prevents duplicate rows even when the same grant comes in via two different PDFs (e.g. an updated vest confirmation).

## Edge cases to think through

- **Multi-tranche grants** — common: one PDF, many vests. Confirmed by the "one result per tranche" emission decision above.
- **Partial prices** — grant letters often have `grant_price` but not `vest_price`; vest confirmations have `vest_price` but typically reference an earlier `grant_price`. The persist endpoint should leave unknown prices null rather than guessing.
- **Foreign tickers / multi-listing** — `symbol` in `fin_equity_awards` is `char(4)`. Document tickers that exceed 4 chars need to be either truncated, mapped, or the schema widened. Flag during implementation; for now the prompt should refuse anything longer than 4 chars.
- **FMV vs strike** — RSUs don't have a strike price; this spec assumes the document is a grant letter or vest confirmation, NOT an option grant. ISOs/NQSOs are out of scope for this job type — they'd need a different `equity_option` job type with strike-price extraction.
- **Vest-back-fill use case** — a follow-up vest confirmation PDF could be imported against an existing grant to back-fill `vest_price` on rows already created via clipboard import. The persist endpoint's `updateOrInsert` already supports this, but we need to decide whether to expose it as a separate "update existing" flow vs. silently merging.
- **Award ID stability** — some employers reuse `award_id` across years; some don't. The unique constraint includes `grant_date` so this is safe.

## Open questions for implementation

1. TOON array vs `addEquityAward` tool call — see § 3.
2. UI surface: dedicated page (`/finance/rsu/import-grant`) vs modal off `ManageAwardsPage.tsx`? The modal is consistent with utility bill / payslip; the page lets us show vest schedules more spaciously.
3. Should a vest-confirmation import update `vest_price` on existing rows by default, or always create a new row that the user can de-dup manually?
4. Do we want a "preview" step that shows the parsed vest schedule visually (the existing `RsuByVestDate` view) before confirming, or is the per-tranche editable form sufficient?

## When implemented

Move the operational sections of this doc into [rsu.md](rsu.md) and turn this
file into a one-line redirect to that section. Keep "open questions" history
in the PR / issue rather than the doc.

## See also

- [rsu.md](rsu.md) — current RSU management (manual + clipboard import).
- [../genai-import.md](../genai-import.md) — shared async pipeline that powers all GenAI imports.
- [../utility-bill-tracker.md](../utility-bill-tracker.md) — reference implementation of the file-upload + per-result confirm pattern.
