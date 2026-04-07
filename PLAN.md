# Tax Preview — Implementation Plan

**Branch:** `k1-k3-extraction-improvements`  
**Reference HTML:** `training_data/k1/tax_analysis_2025_v2.html`  
**Goal:** Close every gap between the reference HTML and the React Tax Preview page, using shadcn theme tokens (no hardcoded colors), with full light/dark support.

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

Reusable primitives already exist in `K1ReviewPanel.tsx` (`FormBlock`, `FormLine`, `FormTotalLine`) and `Form4952Preview.tsx` (`Callout`). Extract these to a shared file before building new sections.

---

## Shared primitives to extract first

**Create `resources/js/components/finance/tax-preview-primitives.tsx`**

Move from existing files:
- `FormBlock` (title bar + dashed-divide children)
- `FormLine` (ref · label · amount, with positive/negative coloring)
- `FormTotalLine` (bold total row, optional double-border)
- `FormSubLine` (indented muted sub-row)
- `Callout` (good / warn / info / alert variants)
- `fmtAmt(n, precision?)` — formats with parentheses for negatives
- `AmountCell` — inline `<span>` version of fmtAmt for table cells

Update all existing files to import from this shared module.

---

## Tab structure (final target)

`TaxPreviewPage.tsx` Tabs:

```
Overview | Documents | K-1 Details | Schedules | Capital Gains | Form 1116 | Tax Estimate | Action Items
```

Current tabs: `Overview | Documents | Schedules | Tax Estimate`  
New tabs to add: `K-1 Details`, `Capital Gains`, `Form 1116`, `Action Items`  
`Schedules` gains Form 4952 fix + Schedule B enhancement.

---

## Item 1 — Fix Form 4952 "no election needed" case

**File:** `resources/js/components/finance/Form4952Preview.tsx`  
**Priority:** High (logic is currently wrong for the common case)

**Problem:** The component always frames the analysis as "should we elect?". But when NII already exceeds total investment interest (Scenario A fully covers it), the correct answer is "no election needed — full deduction allowed, QDs keep 23.8%."

**Fix:**

```tsx
// After computing scenA_deductible and scenA_carryforward:
const noElectionNeeded = scenA_carryforward === 0

// If noElectionNeeded, render a "good" callout at the top:
// "✓ Full $X Deductible — No QD Election Needed"
// "NII of $Y already exceeds interest expense of $Z.
//  QDs retain their 23.8% preferential rate. No carryforward."
// Then show Part I / Part II / Part III with the Scenario A numbers only.
// Skip the election analysis table entirely.
```

When `noElectionNeeded === false` (there IS a gap), show the election analysis table exactly as currently implemented.

**Part II NII line items to add** (currently missing from the component):
- `Box 20A` from K-1 (`data.codes['20']` code `A`) — "Investment income (Form 4952)"
  - This is the authoritative figure many partnerships report; prefer it over the sum of individual boxes when present.
- `Box 13L` / `Box 13AE` suspended deductions — subtract from NII as "investment expenses" (Form 4952 Line 5), even though they are federally suspended under §67(g). Show them as a line item with a note.

**Concrete NII line items the component must handle:**
```
L.4a  Gross investment income (excl. QDs)       [interest + non-qual divs + Sec.1256 + other NII]
L.4b  Qualified dividends elected into NII       [0 when no election needed]
L.4c  L.4a minus L.4b                           [= L.4a when no election]
L.4g  QD election amount                         [blank when no election]
L.4h  Investment income                          [= L.4c]
L.5   Investment expenses                        [suspended §67(g) items, shown but noted]
L.6   Net investment income                      [L.4h minus L.5 (but suspended items don't reduce)]
L.7   Disallowed carryforward                    [$0 when fully deductible]
L.8   Deductible investment interest             [min(L.3, L.6)]
```

**Where it flows (update the warning callout):**
- K-1 Box 13H → Schedule E Part II, nonpassive (per AQR footnote)
- Brokerage margin interest → Schedule A, investment interest (only if itemizing)
- K-1 Box 13ZZ → Schedule E Part II, nonpassive — NOT on Form 4952

---

## Item 2 — Enhance Schedule B to show line-by-line sources

**File:** `resources/js/components/finance/ScheduleBPreview.tsx`  
**Priority:** Medium

**Current state:** Shows only aggregate totals from `income1099` prop.

**New props needed:**
```tsx
interface ScheduleBPreviewProps {
  interestIncome: currency
  dividendIncome: currency
  qualifiedDividends: currency
  selectedYear: number
  // NEW:
  reviewedK1Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
}
```

**New rendering — Part I Interest:**
For each K-1 with Box 5 > 0: one row with payer name (from `fields.B`) and amount.
For each 1099-INT with `box1_interest` > 0: one row with `payer_name` and amount.
Then a subtotal row.

**New rendering — Part II Dividends:**
Same pattern: K-1 Box 6a rows, then 1099-DIV rows, subtotal.
Qualified dividends: K-1 Box 6b + 1099-DIV `box1b_qualified`, subtotal.

Wire the new props through `TaxPreviewPage.tsx` (already has `reviewedK1Docs` and `reviewed1099Docs` in state).

---

## Item 3 — New tab: "K-1 Details"

**New file:** `resources/js/components/finance/K1DetailsTab.tsx`  
**Priority:** High  
**Placed in TaxPreviewPage:** Tab between "Documents" and "Schedules"

This tab shows a **read-only display** of all reviewed K-1s, organized by fund type. It is NOT the edit panel (`K1ReviewPanel`) — it is a presentation view, like the reference HTML Tab 2.

### 3a — AQR (trader fund) section

Detect AQR by checking if the partnership name (fields.B) contains "AQR" or "Delphi" — or simply render all K-1s with `formType === 'K-1-1065'` that have K-3 data.

**Display:**
```
Section header: "[Partnership Name] — K-1 & K-3 Detail"
Sub-header:     "EIN [A] · Partner #[partnerNumber] · [J_capital_ending]% ending interest · [G] partner"
```

**Income Items block** (same FormBlock style as K1ReviewPanel, but read-only display):
- Box 5 interest, Box 6a ordinary divs, Box 6b qualified divs, Box 9a/9b/9c/10 capital
- Box 11 code items, each as its own FormLine with notes as FormSubLine

**Key callout for Box 11ZZ items** (render when Box 11 contains ZZ codes):
```
Callout (warn):
"Box 11ZZ — All Items Are Ordinary Income/Loss, Not Capital"
• Sec. 988 FX loss → IRC §988; ordinary; Schedule E Part II nonpassive
• Swap loss → K-1 footnote directs Schedule E nonpassive; ordinary
• PFIC MTM income → IRC §1296 mark-to-market; ordinary
None of these items go to Schedule D.
```

**Deduction Items block:**
- Box 12, Box 13 codes (each as FormLine + notes), Box 21

**Box 20 Supplemental block:**
- Box 20 codes A (investment income), B (investment expenses), AA (§704(c)), AJ (§461(l))
- Capital account line items (L_beginning_capital, L_contributed, L_current_year_net, L_ending_capital)
- Recourse liabilities from K field

**K-3 Part II table** (already implemented in K1ReviewPanel — reuse):
- Shows gross income by line and country (columns: U.S. Source, Passive, General, Total)
- Render `k3_part2_rows` grouped by sectionId `part2_section1` and `part2_section2`

**K-3 Part III Section 4 table** (already implemented — reuse):
- Foreign taxes by country
- Grand total
- Note: confirm this matches Box 21

### 3b — VC funds section (Tab 5 equivalent)

For each K-1 that is NOT the AQR fund, show a compact card:

```
Card title: "[Partnership Name] (EIN [A])"
Sub: "[J_capital_ending]% ending interest"
```

FormBlock with income lines:
- Box 5 interest, Box 8 ST capital loss, Box 9a LT capital loss, Box 11 codes, Box 21 foreign tax

**Suspended deductions block** — for each Box 13 item with code L or AE (§67(g) items):
```
FormLine with label "Box 13[L/AE] — [description] (§67(g) SUSPENDED)"
Amount shown, but with a muted/strikethrough style or a "⊘" badge to indicate non-deductible federally
```

**Capital account block:**
- L_beginning_capital → L_contributed → L_current_year_net → L_ending_capital
- Recourse liabilities (K_recourse fields)

**After all VC K-1 cards, render:**

```
Callout (warn): "§67(g) — $X Total Suspended Federal Deductions"
Total of all Box 13L/13AE amounts across all VC funds.
"None are deductible on the 2025 federal return under TCJA §67(g).
California does NOT conform — see Action Items tab for Schedule CA treatment."

Callout (info): "K-3 Foreign Income"
"K-3 for [list fund names] shows zero foreign income and taxes in every basket.
No Form 1116 arises from these funds." (with exception note if Box 21 > 0)
```

---

## Item 4 — New component: Form 1116 Preview (summary view)

**New file:** `resources/js/components/finance/Form1116Preview.tsx`  
**Priority:** High  
**Placed in TaxPreviewPage:** New "Form 1116" tab, after "Schedules"

This is a **computation summary**, not the edit panel. It reads from `reviewedK1Docs` and `reviewed1099Docs`.

### Data extraction logic

**Foreign passive income (Part I):**
- From each K-1: look at `k3.sections` with `sectionId === 'part2_section1'`, find rows where `col_c_passive > 0`, sum `col_c_passive` for all rows with line ≤ 24 (i.e., use line 24 total if present)
- From 1099-DIV: `box7_foreign_tax` payers have foreign-sourced dividends; approximate foreign income as `box7_foreign_tax / 0.15` (15% withholding rate) if no better data — or show as "see 1099" with the raw foreign dividend amount from `box2e_section_897_ordinary` if available
- Display each source as a FormLine, then total

**Foreign taxes paid (Part II):**
- From each K-1: `fields['21'].value` (Box 21) — the total creditable foreign taxes
- From 1099-DIV: `box7_foreign_tax`
- From 1099-INT: `box6_foreign_tax`
- List each source as a FormLine, then total

**Passive asset ratio (for apportionment):**
- From K-3 `part3_section2`: `col_c_passive / col_g_total` for the total assets row (line "6a" or "1")
- Store as a percentage, show as "X.XX%"

**Net passive income (Part III limitation input):**
- From K-3 `part3_section2` section, section2 deductions line 55 `col_c_passive`
- This is the K-3 Line 55 passive net income figure

**Limitation calculation (Part III):**
- Foreign passive income / estimated total taxable income × estimated U.S. tax = FTC limitation
- **Note:** Total taxable income and U.S. tax are NOT available from the documents alone — show as "~$[estimate] (enter from your prior return)" with a placeholder
- Credit allowed = min(total foreign taxes, FTC limitation)
- If FTC limitation > total foreign taxes, the full amount is allowed (show ✓)
- Carryforward = 0 when fully allowed

**Key callout — simplified election check:**
```
Callout (warn if total FTC > $300 single / $600 MFJ):
"⚠ Simplified Limitation Election Does NOT Apply"
"Total creditable foreign taxes ($X) exceed the $300/$600 threshold.
Complete Form 1116."

Callout (good if total FTC ≤ threshold):
"✓ Simplified Election May Apply"
"Total FTC ($X) ≤ $300. You may enter directly on Schedule 3 Line 1
without completing Form 1116. Confirm no foreign income in multiple baskets."
```

**Key callout — general category check:**
```
If any K-3 part2_section1 row has col_d_general > 0 and country != 'XX':
  Callout (warn): "⚠ General Category Income Detected — Second Form 1116 May Be Required"
  Show the row(s) with non-zero general category amounts.

If all col_d_general rows have country == 'XX' (sourced by partner):
  Callout (good): "✓ No General Category Form 1116 Required"
  "'Sourced by partner' (XX) amounts are U.S.-source for domestic partners.
   Column (d) effectively = $0 for your return. One Form 1116 (passive) only."
```

**Key callout — TurboTax Line 1d discrepancy:**
```
If k1 Box 5 (interest) > K-3 passive foreign income:
  Callout (alert):
  "⚠ TurboTax FTC Worksheet Line 1d — Correction Required"
  "TurboTax may prefill Line 1d with Box 5 interest ($X) — but Box 5 is
   entirely U.S.-sourced per K-3 Part II Line 6, column (a).
   Set Line 1d to $Y (K-3 passive foreign dividends only)."
```

### Layout

```
[Callout: Simplified election check]
[Callout: General category check]

Two-column grid:
  Left:  Part I — Foreign Source Passive Income  (FormBlock with per-source lines + total)
  Right: Part II — Foreign Taxes Paid            (FormBlock with per-source lines + total)

Full width:
  Part III — Limitation Calculation              (FormBlock)
    Foreign passive income: $X
    Passive asset ratio:    X.XX%
    Apportioned interest:   ~$X (estimated)
    Net passive income:     $X
    [placeholder for U.S. tax and limiting fraction]
    FTC limitation:         ~$X
    Actual foreign taxes:   $X
    Credit allowed:         $X  ← show ✓ FULLY ALLOWED when applicable
    Carryforward:           $0

[Callout: TurboTax Line 1d correction if applicable]
[Callout: Where it flows — Schedule 3 Line 1]
```

---

## Item 5 — New component: Capital Gains & Schedule D preview

**New file:** `resources/js/components/finance/ScheduleDPreview.tsx`  
**Priority:** Medium  
**Placed in TaxPreviewPage:** New "Capital Gains" tab after "K-1 Details"

### Data sources
- K-1 `codes['11']` items with codes `C` (Sec. 1256), `S` (non-portfolio cap G/L), or as decoded from `notes` field
- K-1 `fields['8']` (Box 8, ST capital loss), `fields['9a']`/`9b`/`9c`/`10` (LT)
- 1099-B data if present in reviewed docs (form_type `1099_b`)
- **Note:** Brokerage 1099-B is not yet extracted by the AI pipeline — show a placeholder row with payer name and note "Upload 1099-B for detail"

### Form 6781 (Section 1256 contracts) — show first
```
FormBlock: "Form 6781 — Section 1256 Contracts & Straddles"

For each K-1 with Box 11 code C:
  FormLine: "[Fund name] Box 11C"  value: $X
  FormSubLine: "60% long-term = $[X*0.6]  ·  40% short-term = $[X*0.4]  →  Form 6781 Part I"

FormTotalLine: "Total Sec. 1256 gain/(loss)"

Callout (info):
"Section 1256 contracts are marked to market at year-end. 60% of the gain/loss
 is treated as long-term regardless of holding period. Enter on Form 6781, Part I.
 The 60%/40% split then flows to Schedule D."
```

### Schedule D summary

**Part I — Short-term:**
```
FormBlock: "Schedule D Part I — Short-Term Capital Gains & Losses"

Per source line items:
  K-1 Box 8 (each fund)
  K-1 Box 11S items with ST notes
  Form 6781 40% ST allocation
  1099-B proceeds (if available, otherwise "see brokerage supplement")
  Wash sales adjustment (if 1099-B available)

FormTotalLine: "Part I Net Short-Term"
```

**Part II — Long-term:**
```
FormBlock: "Schedule D Part II — Long-Term Capital Gains & Losses"

Per source line items:
  K-1 Box 9a (each fund)
  K-1 Box 10 (Sec. 1231)
  K-1 Box 11S items with LT notes
  Form 6781 60% LT allocation
  1099-B LT proceeds (if available)

FormTotalLine: "Part II Net Long-Term"
```

**Summary:**
```
FormBlock: "Schedule D Summary"
  Net ST:             $X
  Net LT:             $X
  Combined net:       $X
  Applied to return:  min($3,000, combined net loss) [if loss]
  Carryforward:       combined net loss − $3,000 [show ST/LT split]

Callout (info if large carryforward):
"⚠ Large Capital Loss Carryforward"
"~$X carries to 2026 (split approximately ST: $X / LT: $X).
 Retrieve exact split from your completed Schedule D."
```

---

## Item 6 — New tab: "Action Items"

**New file:** `resources/js/components/finance/ActionItemsTab.tsx`  
**Priority:** High (this is where the preparer's attention goes)  
**Placed in TaxPreviewPage:** Last tab

This tab is data-driven — each item is computed from the reviewed documents, not hardcoded.

### Resolved items section

Header: "✓ Resolved" with a green badge showing count.

Each resolved item rendered as a `Callout (good)`. Items to compute:

| Condition | Resolved item |
|---|---|
| `form4952.noElectionNeeded === true` | "Form 4952 QD Election — No Election Needed" |
| K-3 col_d_general all zero or all XX | "No General Category Form 1116 Required" |
| All Box 11ZZ items have notes specifying ordinary treatment | "Box 11ZZ Character Confirmed — All Ordinary" |
| Total itemized deductions > standard deduction | "Itemizing vs. Standard Deduction — Itemizing Wins" |

### Outstanding items section

Header: "Action Required" with a red badge showing count.

**Computed action items (render only when condition is true):**

**1. TurboTax FTC Line 1d (🔴 ALERT)**
```
Condition: K-1 Box 5 (U.S. interest) ≠ K-3 passive foreign income (col_c sum for income lines)
Render:
  Title: "TurboTax FTC Worksheet Line 1d — Correction Required"
  Body: "TurboTax prefills Line 1d with Box 5 interest ($[box5]) — entirely U.S.-sourced.
         Set to $[k3_passive_income] (K-3 Line 24, passive column only).
         Overstates foreign passive income by $[diff]."
```

**2. California §67(g) Schedule CA (🔴 ALERT)**
```
Condition: Any K-1 has Box 13 code L or AE items (suspended §67(g) deductions)
Render:
  Title: "California Schedule CA — §67(g) Deductions"
  Body: "CA does not conform to TCJA §67(g). The following suspended federal
         deductions may be claimed on Schedule CA (540):"
  [Table: Fund | Box | Description | Amount]
  "Total: $X at 13.3% CA marginal rate ≈ $[X * 0.133] CA tax savings."
```

**3. Pioneer AF24 Box 21 confirmation (🔴 ALERT if Box 21 > 0 but no K-3 Part III Section 4 country entries)**
```
Condition: K-1 has fields['21'] > 0 AND k3.sections has no 'part3_section4' section (or it's empty)
Render:
  Title: "[Fund name] Box 21 ($[amount]) — Confirmation Required"
  Body: "Box 21 shows $[amount] in foreign taxes but the K-3 Part III Section 4
         has no country entries. Confirm with [fund name] that the tax is creditable
         under §901, and obtain country code and date paid before filing Form 1116."
```

**4. Prior-year carryforward check (⚠ WARN — always show)**
```
Render:
  Title: "Confirm Prior-Year Carryforwards"
  Checklist:
    □ Form 4952 Line 7 — investment interest carryforward (assumed $0)
    □ Schedule D carryforward worksheet — any 2024 ST/LT capital loss carryforwards
    □ Form 1116 — any unused FTC carryforward (likely $0)
  "Retrieve from your 2024 tax return before finalizing."
```

**5. Net capital loss carryforward (ℹ INFO — show when Schedule D shows large net loss)**
```
Condition: Combined Schedule D net < -$3,000
Render:
  Title: "Net Capital Loss Carryforward — Be Aware"
  Body: "Combined ST + LT net loss of ~$X far exceeds the $3,000 annual cap.
         ~$[X - 3000] carries to 2026. Confirm exact ST/LT split on completed Schedule D."
```

### Estimated tax position summary

Render at the bottom of Action Items — the same table as in the reference HTML:

| Item | Federal | Notes |
|---|---|---|
| W-2 wages | $X | Box 1 |
| Net investment income | ~$X | Before deductions, subject to 3.8% NIIT |
| AQR K-1 ordinary items | ($X) | Box 11ZZ — Schedule E nonpassive |
| AQR deductions | ($X) | Form 4952 + Schedule E |
| VC funds net | ($X) | Interest + cap losses; §67(g) suspended |
| Net capital gain/loss applied | ($3,000) | Cap; remainder carries forward |
| Investment interest deduction | ($X) | Fully deductible (or with carryforward) |
| Foreign tax credit | $X credit | Passive only — Schedule 3 Line 1 |
| Federal withholding (Box 2) | $X | Already paid |
| Additional Medicare (Form 8959) | ($X) | 0.9% on wages > $200K |

Data sources:
- W-2 wages: `w2GrossIncome` (already in TaxPreviewPage state)
- AQR Box 11ZZ: sum of Box 11 ZZ code items from AQR K-1
- AQR deductions: Box 13H (form 4952 deductible) + Box 13ZZ
- VC net: sum of net K-1 income for non-AQR funds
- Capital loss: from ScheduleDPreview computed values
- Investment interest: from Form4952Preview computed values
- FTC: from Form1116Preview computed values
- Withholding: from W-2 `box2_fed_tax`
- Additional Medicare: `max(0, w2GrossIncome - 200000) * 0.009`

---

## Item 7 — TaxPreviewPage wiring changes

**File:** `resources/js/components/finance/TaxPreviewPage.tsx`

### New tab order
```tsx
<TabsList>
  <TabsTrigger value="overview">Overview</TabsTrigger>
  <TabsTrigger value="documents">Documents</TabsTrigger>
  <TabsTrigger value="k1-details">K-1 Details</TabsTrigger>
  <TabsTrigger value="schedules">Schedules</TabsTrigger>
  <TabsTrigger value="capital-gains">Capital Gains</TabsTrigger>
  <TabsTrigger value="form-1116">Form 1116</TabsTrigger>
  <TabsTrigger value="estimate">Tax Estimate</TabsTrigger>
  <TabsTrigger value="action-items">Action Items</TabsTrigger>
</TabsList>
```

### Pass reviewedK1Docs + reviewed1099Docs to ScheduleBPreview
```tsx
// In the "schedules" TabsContent:
<ScheduleBPreview
  interestIncome={income1099.interestIncome}
  dividendIncome={income1099.dividendIncome}
  qualifiedDividends={income1099.qualifiedDividends}
  selectedYear={selectedYear}
  reviewedK1Docs={reviewedK1Docs}       // NEW
  reviewed1099Docs={reviewed1099Docs}   // NEW
/>
```

### New tab content blocks to add
```tsx
<TabsContent value="k1-details">
  <K1DetailsTab reviewedK1Docs={reviewedK1Docs} />
</TabsContent>

<TabsContent value="capital-gains">
  <ScheduleDPreview reviewedK1Docs={reviewedK1Docs} reviewed1099Docs={reviewed1099Docs} />
</TabsContent>

<TabsContent value="form-1116">
  <Form1116Preview reviewedK1Docs={reviewedK1Docs} reviewed1099Docs={reviewed1099Docs} income1099={income1099} />
</TabsContent>

<TabsContent value="action-items">
  <ActionItemsTab
    reviewedK1Docs={reviewedK1Docs}
    reviewed1099Docs={reviewed1099Docs}
    reviewedW2Docs={reviewedW2Docs}
    income1099={income1099}
    w2GrossIncome={w2GrossIncome}
  />
</TabsContent>
```

---

## Item 8 — Show badge counts on tabs with action items

When a tab has data, show a count badge on the tab trigger so the user knows there's content:
- `K-1 Details`: badge = number of reviewed K-1 docs
- `Action Items`: badge = number of outstanding (non-resolved) action items in red/amber

```tsx
<TabsTrigger value="action-items">
  Action Items
  {outstandingCount > 0 && (
    <Badge variant="destructive" className="ml-1.5 text-[10px] px-1 py-0 h-4">
      {outstandingCount}
    </Badge>
  )}
</TabsTrigger>
```

`outstandingCount` must be computed in `TaxPreviewPage` and passed into `ActionItemsTab` (or returned from it via callback).

---

## Implementation order

1. **Extract shared primitives** → `tax-preview-primitives.tsx` (30 min)
2. **Fix Form 4952** "no election needed" case + add Line 5 suspended deductions (1 hr)
3. **Enhance Schedule B** line-by-line sources (45 min)
4. **K-1 Details tab** — AQR section + VC funds section + §67(g) callouts (2 hr)
5. **Form 1116 Preview** — passive income, foreign taxes, limitation, callouts (2 hr)
6. **Schedule D Preview** — Form 6781 + Part I/II + carryforward (1.5 hr)
7. **Action Items tab** — all computed alerts + estimated tax position table (2 hr)
8. **Wire everything into TaxPreviewPage** — new tabs, badge counts (1 hr)

---

## Files to create
- `resources/js/components/finance/tax-preview-primitives.tsx`
- `resources/js/components/finance/K1DetailsTab.tsx`
- `resources/js/components/finance/Form1116Preview.tsx`
- `resources/js/components/finance/ScheduleDPreview.tsx`
- `resources/js/components/finance/ActionItemsTab.tsx`

## Files to modify
- `resources/js/components/finance/Form4952Preview.tsx` (logic fix + NII lines)
- `resources/js/components/finance/ScheduleBPreview.tsx` (line-by-line sources)
- `resources/js/components/finance/TaxPreviewPage.tsx` (new tabs, new props)
- `resources/js/components/finance/k1/K1ReviewPanel.tsx` (import from shared primitives)
- `resources/js/finance/1116/F1116ReviewPanel.tsx` (import from shared primitives)

## Files NOT to change
- All PHP backend files (no schema changes needed)
- `k1-spec.ts`, `k1-codes.ts`, `k1-types.ts` (data model is correct)
- `K1CodesModal.tsx` (works as-is)
- `TaxDocumentsSection.tsx`, `TaxDocuments1099Section.tsx` (upload flows unchanged)
- `Form1040Preview.tsx` (out of scope for this plan)
