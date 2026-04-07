# Tax Preview — Implementation Plan

**Branch:** `k1-k3-extraction-improvements`  
**Reference HTML:** `training_data/k1/tax_analysis_2025_v2.html`  
**Goal:** Close every gap between the reference HTML and the React Tax Preview page, using shadcn theme tokens (no hardcoded colors), with full light/dark support.

---

## Principles

- **Preserve the document pipeline.** Upload → GenAI extraction → review/confirm flow must remain intact for W-2, 1099-INT, 1099-DIV, 1099-B, K-1/K-3 documents. The GenAI processing system (Gemini tool-call pipeline) continues to be used for all document types.
- **Year changes are full navigations.** The year selector navigates to `/finance/tax-preview?year=2025` — a full page load. The Blade template reads the query string and passes the year to the controller, which preloads data for that year. This eliminates client-side year-change waterfalls entirely.
- **Preload what's cheap, lazy-load what's heavy.** Payslips, 1099 totals, Schedule C summary, pending review count, and reviewed W-2 docs are small and cheap — preload them in the Blade template via `<script type="application/json">`. K-1 documents with full `parsed_data` (K-3 sections can be large) are better fetched client-side on demand.
- **Retire single-purpose API endpoints.** If data is preloaded in the Blade template, the corresponding API endpoint used only by the tax preview page can be removed (e.g., the payslips-for-year fetch). Endpoints used by other pages or for mutations (upload, save, review) stay.
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

The Tax Preview page currently issues **5+ independent API calls** on mount:

| Call | Endpoint | Triggered by |
|---|---|---|
| Payslips for year | `GET /api/payslips?year=X` | `TaxPreviewPage useEffect` |
| Pending review count | `GET /api/finance/tax-documents?genai_status=parsed&is_reviewed=0` | `TaxPreviewPage useEffect` |
| Reviewed K-1 docs | `GET /api/finance/tax-documents?form_type=k1&is_reviewed=1` | `TaxPreviewPage useEffect` |
| W-2 docs (by form_type) | `GET /api/finance/tax-documents?form_type=w2...` | `TaxDocumentsSection useEffect` |
| 1099 docs | `GET /api/finance/tax-documents?form_type=1099_int...` | `TaxDocuments1099Section useEffect` |
| Schedule C | `GET /api/finance/schedule-c` | `ScheduleCPreview useEffect` |
| Employment entities | `GET /api/finance/employment-entities?visible_only=false` | `TaxDocumentsSection useEffect` |
| Accounts | `GET /api/finance/accounts?active_year=X` | `TaxDocuments1099Section useEffect` |

Result: waterfall of requests, visible loading spinners, no data on first paint.

### Target architecture

**Year changes navigate to a new URL.** When the user selects a different year, instead of client-side state update + re-fetch, we do:

```tsx
// YearSelectorWithNav or TaxPreviewPage
function handleYearChange(year: number | 'all') {
    const url = new URL(window.location.href)
    url.searchParams.set('year', String(year))
    window.location.href = url.toString() // full navigation
}
```

This means the Blade preload always has the right year's data — no stale/mismatched state.

**Server-side preload (Blade template injection):**

```php
// app/Http/Controllers/Finance/TaxPreviewController.php

class TaxPreviewController extends Controller
{
    public function __construct(
        private TaxPreviewDataService $preloadService,
    ) {}

    public function show(Request $request): View
    {
        $year = (int) ($request->query('year') ?? date('Y'));

        $preload = $this->preloadService->forYear(Auth::id(), $year);

        return view('finance.tax-preview', [
            'preload' => $preload,
            'year' => $year,
        ]);
    }
}
```

```php
// app/Services/Finance/TaxPreviewDataService.php

class TaxPreviewDataService
{
    public function forYear(int $userId, int $year): array
    {
        return [
            'year'               => $year,
            'availableYears'     => $this->availableYears($userId),
            'payslips'           => $this->payslipsForYear($userId, $year),
            'pendingReviewCount' => $this->pendingReviewCount($userId, $year),
            'reviewedW2Docs'     => $this->reviewedDocs($userId, $year, ['w2']),
            'reviewed1099Docs'   => $this->reviewedDocs($userId, $year, ['1099_int', '1099_div', '1099_b', '1099_int_c', '1099_div_c', '1099_b_c']),
            'scheduleCData'      => $this->scheduleCForYear($userId, $year),
            'employmentEntities' => $this->entities($userId),
        ];
        // NOTE: K-1 docs are NOT preloaded — they carry large parsed_data with K-3 sections.
        // They are fetched client-side on demand when the user visits the K-1 Details tab
        // or any tab that needs them (first access triggers fetch, result is cached in React state).
    }
}
```

**What gets preloaded vs. lazy-loaded:**

| Data | Preloaded? | Reason |
|---|---|---|
| Payslips for year | ✅ Yes | Small rows, needed immediately for W-2 summary and tax tables |
| Pending review count | ✅ Yes | Single integer, drives the "Review Documents" button badge |
| Reviewed W-2 docs | ✅ Yes | Small `parsed_data`, needed for Overview + Tax Estimate |
| Reviewed 1099 docs | ✅ Yes | Small `parsed_data`, needed for Overview + Schedule B + Form 4952 |
| Schedule C data | ✅ Yes | Already aggregated on server, needed for Schedule C tab + Tax Estimate |
| Employment entities | ✅ Yes | Small list, needed by Documents tab |
| Available years | ✅ Yes | Drives the year selector — merge payslip years + Schedule C available years |
| Reviewed K-1 docs | ❌ No | `parsed_data` includes full K-3 sections (can be 10KB+ per doc). Fetched once client-side, then shared across all tabs via React state |
| Accounts (for 1099 linking) | ❌ No | Only needed when Documents tab 1099 section is visible |

**Blade template:**

```blade
{{-- resources/views/finance/tax-preview.blade.php --}}
<script type="application/json" id="tax-preview-data">
    {!! json_encode($preload, JSON_HEX_TAG | JSON_THROW_ON_ERROR) !!}
</script>

@viteReactRefresh
@vite(['resources/js/pages/finance/tax-preview.tsx'])
```

**React bootstrap:**

```tsx
// In TaxPreviewPage or its mount point

interface TaxPreviewPreload {
    year: number
    availableYears: number[]
    payslips: fin_payslip[]
    pendingReviewCount: number
    reviewedW2Docs: TaxDocument[]
    reviewed1099Docs: TaxDocument[]
    scheduleCData: YearData[]  // same shape as ScheduleCResponse.years
    employmentEntities: { id: number; display_name: string; type: string }[]
}

function readPreload(): TaxPreviewPreload | null {
    const el = document.getElementById('tax-preview-data')
    if (!el?.textContent) return null
    try { return JSON.parse(el.textContent) } catch { return null }
}
```

`TaxPreviewPage` initializes state from the preload. The only client-side fetch on mount is for K-1 docs. After a document is reviewed/confirmed in the modal, the affected doc-type state is re-fetched (single targeted call, not full-page reload).

### API endpoints to retire (after Blade preload is live)

These are currently called only by TaxPreviewPage and would be fully replaced by the preload:

| Endpoint | Used by | Can retire? |
|---|---|---|
| `GET /api/payslips?year=X` | TaxPreviewPage | ✅ Yes — preloaded; only TaxPreviewPage uses the year-filtered version |
| `GET /api/finance/schedule-c` | ScheduleCPreview | ✅ Yes — preloaded (year-filtered); only ScheduleCPreview uses this |
| `GET /api/finance/employment-entities?visible_only=false` | TaxDocumentsSection | ⚠️ Maybe — check if other pages use it too |

Endpoints that must stay:
- `GET /api/finance/tax-documents` — used with various filters by multiple pages, plus the K-1 lazy-load
- All mutation endpoints (POST, PUT, DELETE) for uploads, reviews, etc.
- `GET /api/payslips` without year filter (used by PayslipClient page)

---

## Item 1 — Fix Form 4952 "no election needed" case ✅ DONE

Implemented in `Form4952Preview.tsx`. When `NII ≥ totalInvIntExpense`, shows ✓ good callout; election analysis table hidden. Box 20A used as authoritative NII figure. §67(g) suspended items shown on Line 5.

---

## Item 2 — Enhance Schedule B to show line-by-line sources ✅ DONE

Implemented in `ScheduleBPreview.tsx`. Per-source lines from K-1 and 1099 docs. Aggregated fallback. Two-column layout.

---

## Item 3 — K-1 Details tab ✅ DONE

Implemented in `K1DetailsTab.tsx`. Per-fund cards, Box 11ZZ callout, §67(g) cross-fund summary.

---

## Item 4 — Form 1116 Preview tab ✅ DONE

Implemented in `Form1116Preview.tsx`. Passive FTC, simplified election check, general category check, TurboTax Line 1d alert.

---

## Item 5 — Capital Gains / Schedule D tab ✅ DONE

Implemented in `ScheduleDPreview.tsx`. Form 6781 60/40 split, per-source lines, carryforward.

---

## Item 6 — Action Items tab ✅ DONE

Implemented in `ActionItemsTab.tsx`. Resolved/outstanding alerts, estimated tax position summary.

---

## Item 7 — Schedule C tab ⬜ NOT DONE

**Existing code:** `ScheduleCPreview.tsx` (currently in Documents tab)  
**New file:** `resources/js/components/finance/ScheduleCTab.tsx`

### Current state

`ScheduleCPreview` already handles:
- Fetching transaction-based Schedule C data from `GET /api/finance/schedule-c`
- Income/expense categories grouped by `tax_characteristic` from `FinAccountTag`
- Home office expenses as a separate category (`sch_c_home_office` characteristics)
- Home office carry-forward calculation across years
- Per-entity breakdown when multiple Schedule C businesses exist

### What needs to change

1. **Move to its own tab.** Currently buried at the bottom of the Documents tab. It should be a first-class tab between "Form 1116" and "Tax Estimate."

2. **Accept preloaded Schedule C data.** Instead of fetching internally, accept `scheduleCData` as a prop from TaxPreviewPage (which gets it from the Blade preload). The year-filter logic stays but operates on preloaded data.

3. **Lift year-availability detection up.** Currently `ScheduleCPreview` calls `onAvailableYearsChange` with years derived from the Schedule C response. After preload, available years are already known from `TaxPreviewDataService::availableYears()` (which should merge payslip years + Schedule C years). Remove the `onAvailableYearsChange` callback.

4. **Home office data is transaction-based.** The `sch_c_home_office` tax characteristics (`scho_rent`, `scho_mortgage_interest`, `scho_utilities`, `scho_insurance`, etc.) are already defined in `FinAccountTag::TAX_CHARACTERISTICS`. Users tag transactions with these characteristics, and `FinanceScheduleCController::getSummary()` aggregates them. The Schedule C tab already renders these via `schedule_c_home_office` in the entity data. What's missing:
   - **Form 8829 presentation.** Currently shows raw category totals. Should render as Form 8829 line items with business-use percentage computation.
   - **Simplified method comparison.** Show both simplified ($5/sqft, max $1,500) and regular (actual expenses × business %) side by side so the user can pick the better option.
   - **Business-use percentage storage.** The `office_sqft` and `home_sqft` values need to be stored per entity per year. Options:
     - Add fields to the employment entity model
     - Store as a separate `schedule_c_config` JSON column on the employment entity
     - Store as user-entered metadata in a new table
   - For now, accept as props or editable fields in the UI; persist design TBD.

5. **Vehicle expense section (Form 4562 / Sch C Line 9):**
   - `sce_car_truck` characteristic already captures tagged vehicle transactions
   - Add comparison: standard mileage rate ($0.70/mi for 2025) × user-entered miles vs. actual expenses
   - Mileage tracking is manual entry (not derived from transactions)

6. **Wire into TaxPreviewPage:** Add `schedule-c` tab. Remove `ScheduleCPreview` from the Documents tab. Pass preloaded schedule C data + the net income callback.

### Form 8829 rendering (pseudo-structure)

```
FormBlock: "Form 8829 — Home Office Deduction"
  // Lines 1-7: Area calculation
  FormLine: "L.1  Office area (sq ft)"           → user-entered
  FormLine: "L.2  Home total area (sq ft)"       → user-entered
  FormLine: "L.3  Business-use percentage"        → L.1 ÷ L.2
  
  // Lines 8-27: Direct + indirect expenses
  // Pull from tagged transactions:
  //   scho_mortgage_interest → Line 10
  //   scho_real_estate_taxes → Line 11
  //   scho_insurance         → Line 18
  //   scho_utilities         → Line 21
  //   scho_repairs_maintenance → Line 22
  //   scho_rent              → Line 20
  //   scho_depreciation      → Line 28
  // Each shows: full amount × business_pct = allowable
  
  FormTotalLine: "L.36  Allowable home office deduction"  → flows to Sch C Line 30
  
  // Carry-forward (already computed in ScheduleCPreview)
  FormLine: "Carryforward from prior year"
  FormLine: "Disallowed this year (income limitation)"

Callout (info): "Simplified Method Comparison"
  "Simplified: $5 × [sqft] = $[min(sqft*5, 1500)]"
  "Regular:    actual expenses × [pct]% = $[regular_total]"
  "→ [Better method] saves $[difference]"
```

---

## Item 8 — Data loading improvements ⬜ NOT DONE

### Phase A: Centralize React state + preload prop

1. Add `TaxPreviewPreload` interface to TaxPreviewPage.
2. Accept `initialData?: TaxPreviewPreload` prop.
3. Initialize all state from preload when available (payslips, W-2 docs, 1099 docs, Schedule C, entities, pending count, available years).
4. Keep the K-1 docs fetch as a client-side `useEffect` (only fetch that fires on mount).
5. Refactor child components to accept data as props:
   - `TaxDocumentsSection`: accept `documents` and `employmentEntities` as optional props; skip internal fetch when provided
   - `TaxDocuments1099Section`: accept `documents` as optional prop; skip internal fetch when provided
   - `ScheduleCPreview` / `ScheduleCTab`: accept `scheduleCData` prop; skip internal fetch when provided
6. Keep all `onDocumentReviewed()` callbacks — on review, re-fetch only the affected doc type.

### Phase B: Server-side preload

1. Create `TaxPreviewDataService` (as described in Data Loading Strategy above).
2. Create `TaxPreviewController::show()` — thin, delegates to service.
3. Update `routes/web.php`: replace the inline closure with the controller.
4. Update Blade template to inject `<script type="application/json" id="tax-preview-data">`.
5. Update TaxPreviewPage mount point to read preload and pass as `initialData`.
6. Year selector navigates (`window.location.href = ...`) instead of `setSelectedYear()` + `pushState`.

### Phase C: Retire redundant API endpoints

After Phase B is stable:
- Remove client-side `useEffect` fetches for payslips, 1099 docs, W-2 docs, Schedule C, pending count.
- Evaluate whether `GET /api/payslips?year=X` is used elsewhere; if not, remove.
- Evaluate whether `GET /api/finance/schedule-c` is used elsewhere; if not, remove.
- Keep `GET /api/finance/tax-documents` — used for K-1 lazy-load and by other pages.

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

**Documents tab** retains:
- W-2 upload + payslip summary + GenAI review
- 1099 document upload + review (GenAI pipeline)
- K-1 / K-3 document upload + review (GenAI pipeline)
- "Review Documents" button with pending-count badge

Schedule C moves entirely to its own tab. The year-availability detection moves up to TaxPreviewPage (derived from preloaded `availableYears`).

---

## Implementation order

1. **Data loading Phase A** — centralize React state, accept preload prop, refactor children to accept data as props
2. **Schedule C tab** — extract ScheduleCPreview into ScheduleCTab, add Form 8829 presentation, accept preloaded data
3. **TaxPreviewPage wiring** — add `schedule-c` tab, remove ScheduleCPreview from Documents, year selector navigates instead of pushState
4. **Data loading Phase B** — TaxPreviewDataService, TaxPreviewController, Blade preload, mount-point reads preload
5. **Data loading Phase C** — retire single-purpose API endpoints after preload is stable

---

## Files to create
- `resources/js/components/finance/ScheduleCTab.tsx` (wraps ScheduleCPreview + Form 8829 block)
- `app/Http/Controllers/Finance/TaxPreviewController.php` (thin controller for preload)
- `app/Services/Finance/TaxPreviewDataService.php` (aggregates preload data for a given year)

## Files to modify
- `resources/js/components/finance/TaxPreviewPage.tsx` (preload prop, tab order, Schedule C tab, year-change-as-navigation)
- `resources/js/components/finance/ScheduleCPreview.tsx` (accept data as prop, remove internal fetch when prop provided)
- `resources/js/components/finance/TaxDocumentsSection.tsx` (accept pre-fetched docs + entities as optional props)
- `resources/js/components/finance/TaxDocuments1099Section.tsx` (accept pre-fetched docs as optional prop)
- `resources/views/finance/tax-preview.blade.php` (add script tag for preload)
- `routes/web.php` (replace inline closure with TaxPreviewController)

## Files NOT to change
- All GenAI processor PHP files (`GenAiJobDispatcherService`, prompts, tool definitions)
- `k1-spec.ts`, `k1-codes.ts`, `k1-types.ts`
- `K1CodesModal.tsx`, `K1ReviewPanel.tsx`, `F1116ReviewPanel.tsx` (review UI is complete)
- `tax-preview-primitives.tsx` (shared primitives are stable)
- `Form4952Preview.tsx`, `ScheduleBPreview.tsx`, `K1DetailsTab.tsx`, `Form1116Preview.tsx`, `ScheduleDPreview.tsx`, `ActionItemsTab.tsx` (all complete)
