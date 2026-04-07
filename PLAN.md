# Tax Preview — Implementation Plan

**Branch:** `k1-k3-extraction-improvements`  
**Reference HTML:** `training_data/k1/tax_analysis_2025_v2.html`  
**Goal:** Close every gap between the reference HTML and the React Tax Preview page, using shadcn theme tokens (no hardcoded colors), with full light/dark support.

---

## Principles

- **Preserve the document pipeline.** Upload → GenAI extraction → review/confirm flow must remain intact for W-2, 1099-INT, 1099-DIV, 1099-B, K-1/K-3 documents. The GenAI processing system (Gemini tool-call pipeline) continues to be used for all document types.
- **Preload and share data.** Avoid repeated API calls for the same dataset across tabs. Data fetched once in `TaxPreviewPage` is passed as props to child tabs. For initial page load, inject pre-fetched server-side data via `<script type="application/json" id="tax-preview-data">` in the Blade template to eliminate the first round-trip.
- **Blade/PHP separation.** Data injection belongs in a dedicated `TaxPreviewController` method that calls service classes. No business logic in the Blade file — the script tag contains only serialized DTO output. Keep controllers thin; logic in service classes.
- **Tabs for all workflows.** The tab structure covers the full return scope, including Schedule C (self-employment, home office) which was not in the reference HTML but is part of the existing codebase.

---

## Styling conventions (apply everywhere)

The reference HTML uses a dark terminal aesthetic. In React we translate to shadcn tokens:

| Reference class | shadcn/Tailwind equivalent |
|---|---|
| Positive amount (green) | `text-emerald-600 dark:text-emerald-500` |
| Negative amount (red/orange) | `text-destructive` |
| Accent value (teal/cyan) | `text-primary` |
| `form-block-title` background | `bg-muted/40 border-b` |
| `form-line` separator | `divide-y divide-dashed divide-border/50` |
| `callout good` | `border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30` |
| `callout warn` | `border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30` |
| `callout info` | `border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30` |
| `callout alert` (red) | `border-destructive/30 bg-destructive/5 dark:bg-destructive/10` |
| `subtotal` table row | `font-semibold bg-muted/20` |
| `total` table row | `font-semibold bg-muted/30 border-t-2 border-double` |
| Muted sub-text | `text-muted-foreground text-[11px]` |
| Mono amounts | `font-mono tabular-nums` |

Shared primitives live in `resources/js/components/finance/tax-preview-primitives.tsx`:
`FormBlock`, `FormLine`, `FormTotalLine`, `FormSubLine`, `Callout`, `fmtAmt`, `AmountCell`.

---

## Tab structure (final target)

```
Overview | Documents | K-1 Details | Schedules | Capital Gains | Form 1116 | Schedule C | Tax Estimate | Action Items
```

| Tab | Status | Notes |
|---|---|---|
| Overview | ✅ Built | Income card grid + summary table |
| Documents | ✅ Built | W-2, K-1, 1099 upload + GenAI review flow |
| K-1 Details | ✅ Built | Per-fund income/deduction/K-3 cards |
| Schedules | ✅ Built | Schedule B (enhanced) + Form 4952 (fixed) |
| Capital Gains | ✅ Built | Form 6781 + Schedule D |
| Form 1116 | ✅ Built | Passive FTC, TurboTax alert |
| Schedule C | ⬜ Gap | Home office, vehicle, business income/expense |
| Tax Estimate | ✅ Built | Form 1040 preview + tax tables |
| Action Items | ✅ Built | Resolved/outstanding alerts + position summary |

---

## Data loading strategy

### Current state (problems)
- `TaxPreviewPage` fetches K-1 docs in its own `useEffect` — separate from the W-2 and 1099 fetches in `TaxDocumentsSection` / `TaxDocuments1099Section`
- On first render, users see the page before any data arrives (multiple waterfalls)
- No data shared between tabs — if two tabs need "all reviewed K-1s" they each re-derive from the same prop

### Target architecture

**Server-side preload (Blade template injection):**

```php
// app/Http/Controllers/Finance/TaxPreviewController.php

class TaxPreviewController extends Controller
{
    public function __construct(private TaxDocumentService $taxDocService) {}

    public function show(Request $request): View
    {
        $year = (int) ($request->query('year') ?? date('Y'));
        $userId = Auth::id();

        $preload = $this->taxDocService->getPreloadData($userId, $year);

        return view('finance.tax-preview', compact('preload', 'year'));
    }
}
```

```php
// app/Services/Finance/TaxDocumentService.php  (new method)

public function getPreloadData(int $userId, int $year): array
{
    return [
        'reviewedK1Docs'   => $this->reviewedDocs($userId, $year, 'k1'),
        'reviewedW2Docs'   => $this->reviewedDocs($userId, $year, 'w2'),
        'reviewed1099Docs' => $this->reviewedDocs($userId, $year, ['1099_int', '1099_div', '1099_b']),
        'pendingCount'     => $this->pendingCount($userId, $year),
    ];
}
```

**Blade template:**

```blade
{{-- resources/views/finance/tax-preview.blade.php --}}
<script type="application/json" id="tax-preview-data">
    {!! json_encode($preload, JSON_HEX_TAG) !!}
</script>

@viteReactRefresh
@vite(['resources/js/pages/finance/tax-preview.tsx'])
```

**React bootstrap:**

```tsx
// resources/js/pages/finance/tax-preview.tsx
function readPreload(): TaxPreviewPreload {
    const el = document.getElementById('tax-preview-data')
    if (!el) return { reviewedK1Docs: [], reviewedW2Docs: [], reviewed1099Docs: [], pendingCount: 0 }
    try {
        return JSON.parse(el.textContent ?? '{}') as TaxPreviewPreload
    } catch {
        return { reviewedK1Docs: [], reviewedW2Docs: [], reviewed1099Docs: [], pendingCount: 0 }
    }
}

// Pass preload as initialState to TaxPreviewPage
const preload = readPreload()
createRoot(document.getElementById('app')!).render(<TaxPreviewPage initialData={preload} />)
```

**TaxPreviewPage prop:**

```tsx
interface TaxPreviewPageProps {
    initialData?: TaxPreviewPreload
}

export default function TaxPreviewPage({ initialData }: TaxPreviewPageProps) {
    const [reviewedK1Docs, setReviewedK1Docs] = useState<TaxDocument[]>(initialData?.reviewedK1Docs ?? [])
    const [reviewedW2Docs, setReviewedW2Docs] = useState<TaxDocument[]>(initialData?.reviewedW2Docs ?? [])
    const [reviewed1099Docs, setReviewed1099Docs] = useState<TaxDocument[]>(initialData?.reviewed1099Docs ?? [])
    // ...
}
```

After a document is reviewed/confirmed, refresh only the changed document type (not the full page). The `refreshTrigger` increment already handles this; make the per-type fetches depend on it.

---

## Item 1 — Fix Form 4952 "no election needed" case ✅ DONE

**Status:** Implemented in `Form4952Preview.tsx`.

- When `NII ≥ totalInvIntExpense`, shows `✓ Full $X Deductible` good callout; election analysis table hidden.
- Box 20A used as authoritative NII figure when present.
- §67(g) suspended items shown on Line 5 with note (not deducted).

---

## Item 2 — Enhance Schedule B to show line-by-line sources ✅ DONE

**Status:** Implemented in `ScheduleBPreview.tsx`.

- Per-source lines from K-1 Box 5/6a/6b and 1099-INT/DIV.
- Aggregated fallback when no per-source data is available.
- Two-column layout (Part I Interest / Part II Dividends).

---

## Item 3 — K-1 Details tab ✅ DONE

**Status:** Implemented in `K1DetailsTab.tsx`.

- Per-fund cards with income, deduction, K-3 Part II, K-3 Part III §4 blocks.
- Box 11ZZ ordinary income callout.
- §67(g) suspension cross-fund summary with CA savings estimate.

---

## Item 4 — Form 1116 Preview tab ✅ DONE

**Status:** Implemented in `Form1116Preview.tsx`.

- Passive income and foreign tax sources.
- Simplified election threshold check.
- General category (XX) check.
- TurboTax Line 1d correction alert.
- Part III limitation (estimated, with placeholders for prior-return data).

---

## Item 5 — Capital Gains / Schedule D tab ✅ DONE

**Status:** Implemented in `ScheduleDPreview.tsx`.

- Form 6781 Section 1256 with 60/40 split.
- Schedule D Part I/II per-source lines.
- Carryforward summary with $3,000 annual cap.
- 1099-B placeholder with upload prompt.

---

## Item 6 — Action Items tab ✅ DONE

**Status:** Implemented in `ActionItemsTab.tsx`.

- Computed resolved/outstanding items.
- TurboTax FTC Line 1d alert, §67(g) CA deductions table, Box 21 K-3 confirmation, prior-year carryforward checklist.
- Estimated tax position summary table.

---

## Item 7 — Schedule C tab ⬜ NOT DONE

**File:** Existing `ScheduleCPreview.tsx` (currently embedded in Documents tab)  
**New file:** `resources/js/components/finance/ScheduleCTab.tsx`

The Schedule C content already exists in the codebase (`ScheduleCPreview`) but is currently buried inside the Documents tab. It needs to be:

1. **Moved to its own tab** "Schedule C" between "Form 1116" and "Tax Estimate".
2. **Enhanced with home office deduction section:**

```tsx
// In ScheduleCTab.tsx (wraps ScheduleCPreview + adds home office block)

// Home office deduction (Form 8829)
// Data source: user-entered or from parsed documents
//   - office_sqft: number
//   - home_sqft: number
//   - home_expenses: { mortgage_interest, rent, utilities, insurance, repairs }
// Computation:
//   - business_pct = office_sqft / home_sqft
//   - deductible = home_expenses_total × business_pct  (simplified method: $5/sqft, max 300 sqft)
//   - Form 8829 Line 36 flows to Schedule C Line 30

// Render:
<FormBlock title="Form 8829 — Home Office Deduction">
  <FormLine label="Office sq ft" raw={String(office_sqft)} />
  <FormLine label="Home sq ft" raw={String(home_sqft)} />
  <FormLine label="Business-use percentage" raw={`${(business_pct * 100).toFixed(1)}%`} />
  <FormLine label="Allowable home expenses" value={deductible} />
  <FormTotalLine label="Home office deduction (→ Sch C Line 30)" value={deductible} />
</FormBlock>

<Callout kind="info" title="ℹ Simplified vs. Regular Method">
  <p>Simplified: $5/sq ft × office sq ft (max $1,500).
     Regular: actual expenses × business %.</p>
  <p>Show both and let the user choose.</p>
</Callout>
```

3. **Vehicle deduction section (if applicable):**

```
FormBlock: "Vehicle Expenses (Form 4562 / Sch C Line 9)"
  Standard mileage rate: [miles] × $0.67/mi = $X  (2024 rate)
  — OR —
  Actual expenses: gas + insurance + depreciation × business %
```

4. **Wire into TaxPreviewPage:** Add `schedule-c` tab between `form-1116` and `estimate`. Remove Schedule C from Documents tab.

---

## Item 8 — Data loading improvements ⬜ NOT DONE

**Priority:** Medium (performance / UX)

### Phase A: Centralize React state (immediate, no Blade change needed)

All three reviewed-doc arrays (`reviewedK1Docs`, `reviewedW2Docs`, `reviewed1099Docs`) are already in `TaxPreviewPage` state. The issue is that `TaxDocumentsSection` and `TaxDocuments1099Section` also fetch internally. Refactor so that:

- `TaxPreviewPage` owns all fetches.
- Pass fetched data down as props to child sections.
- Child sections emit `onDocumentReviewed()` → parent re-fetches that type only.

This eliminates duplicate API calls when both the overview card grid and the documents section need "reviewed W-2 docs".

### Phase B: Server-side preload (Blade script tag)

As described in the "Data loading strategy" section above. Requires:

1. New `TaxPreviewController::show()` method.
2. New `TaxDocumentService::getPreloadData()` method.
3. Blade template updated to inject `<script type="application/json">`.
4. `TaxPreviewPage` reads preload via `document.getElementById('tax-preview-data')`.

**Do NOT put business logic in Blade.** The Blade file outputs only `{!! json_encode($preload) !!}` where `$preload` is a plain array from the service. All filtering, formatting, and computation stays in the service class.

### Phase C: Year-aware caching

The preload is year-specific. If the user switches years:
- The React year selector triggers a fresh `fetchWrapper.get(...)` for the new year.
- The Blade preload only applies to the initial year on page load.

---

## Item 9 — TaxPreviewPage tab order and wiring ⬜ PARTIALLY DONE

**Current state:** 8 tabs built. Schedule C still in Documents tab.

**Target tab order:**
```tsx
<TabsList>
  <TabsTrigger value="overview">Overview</TabsTrigger>
  <TabsTrigger value="documents">Documents</TabsTrigger>
  <TabsTrigger value="k1-details">K-1 Details</TabsTrigger>
  <TabsTrigger value="schedules">Schedules</TabsTrigger>
  <TabsTrigger value="capital-gains">Capital Gains</TabsTrigger>
  <TabsTrigger value="form-1116">Form 1116</TabsTrigger>
  <TabsTrigger value="schedule-c">Schedule C</TabsTrigger>
  <TabsTrigger value="estimate">Tax Estimate</TabsTrigger>
  <TabsTrigger value="action-items">Action Items</TabsTrigger>
</TabsList>
```

**Documents tab** should retain:
- W-2 upload + payslip summary
- 1099 document upload + review (GenAI pipeline)
- K-1 / K-3 document upload + review (GenAI pipeline)
- "Review Documents" button with pending-count badge (already works)

Schedule C content moves to its own tab; the ScheduleCPreview component stays in the Documents tab's data pipeline (for year availability detection) but its display moves to the Schedule C tab.

---

## Implementation order

1. **Data loading Phase A** — centralize fetches in TaxPreviewPage, eliminate duplicate API calls
2. **Schedule C tab** — move ScheduleCPreview out of Documents, add Form 8829 home office block
3. **TaxPreviewPage wiring** — add `schedule-c` tab trigger + content, adjust Documents tab
4. **Data loading Phase B** — Blade script-tag preload, TaxPreviewController, TaxDocumentService

---

## Files to create
- `resources/js/components/finance/ScheduleCTab.tsx` (wraps ScheduleCPreview + home office block)
- `app/Http/Controllers/Finance/TaxPreviewController.php` (thin controller for preload)
- `app/Services/Finance/TaxDocumentPreloadService.php` (or add method to existing service)

## Files to modify
- `resources/js/components/finance/TaxPreviewPage.tsx` (tab order, Schedule C tab, preload prop)
- `resources/js/components/finance/TaxDocumentsSection.tsx` (accept pre-fetched docs as optional prop)
- `resources/js/components/finance/TaxDocuments1099Section.tsx` (accept pre-fetched docs as optional prop)
- `resources/views/finance/tax-preview.blade.php` (add script tag for preload)
- `routes/web.php` (point tax-preview route to new controller if not already)

## Files NOT to change
- All GenAI processor PHP files (`GenAiJobDispatcherService`, prompts, tool definitions)
- `k1-spec.ts`, `k1-codes.ts`, `k1-types.ts`
- `K1CodesModal.tsx`, `K1ReviewPanel.tsx`, `F1116ReviewPanel.tsx` (review UI is complete)
- `tax-preview-primitives.tsx` (shared primitives are stable)
- `Form4952Preview.tsx`, `ScheduleBPreview.tsx`, `K1DetailsTab.tsx`, `Form1116Preview.tsx`, `ScheduleDPreview.tsx`, `ActionItemsTab.tsx` (all complete)
