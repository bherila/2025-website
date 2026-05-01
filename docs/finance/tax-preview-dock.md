# Tax Preview — Miller-Column "Dock" Shell

The Tax Preview page has two UIs: the legacy vertical Tabs view and a horizontal Miller-columns drill-down shell ("dock mode"). Both render the same `TaxPreviewPage` component and the same `TaxPreviewProvider` data; only the outer chrome differs.

**Opt-in**: append `?dock=1` to the URL (e.g. `/finance/tax-preview?year=2025&dock=1`). The gate lives at `TaxPreviewPage.tsx:dockMode` — a query-string check. There is no per-user opt-in or admin flag yet.

---

## Architecture

```
TaxPreviewPage (dock branch)
├── DockActionsProvider                        // ⌘K palette + worksheet dialog dispatch
│   ├── DockHeaderBar                          // title + "Jump to form…" button + ?dock=0 hint
│   ├── TaxEstimateHeader                      // persistent 3-tier (slim / expanded / full modal)
│   └── MillerShell
│       ├── CommandPalette                     // ⌘K palette
│       ├── <section> per route column         // hidden on narrow; shown side-by-side on md+
│       │   └── FormRegistryEntry.component    // adapter → preview component
│       └── WorksheetDialog                    // modal-presentation entries open here
```

### Key files

| File | Role |
|------|------|
| `resources/js/components/finance/TaxPreviewPage.tsx` | `dockMode` gate at `~line 473`; branches between Tabs UI and `MillerShell` |
| `resources/js/components/finance/tax-preview/MillerShell.tsx` | Renders the route as a horizontal stack of columns. Handles Escape-to-truncate, overflow-x-auto container, narrow-screen fallback (show only the last column). |
| `resources/js/components/finance/tax-preview/useTaxRoute.ts` | Parses URL hash (`#/form-1040/sch-1/form-1116:general`) → `{ columns: [{form, instance?}] }`; mutations push to `window.history`. |
| `resources/js/components/finance/tax-preview/DockHomeView.tsx` | Landing view (zero-column route). Cards: Recent, Pinned, App, Forms, Worksheets. |
| `resources/js/components/finance/tax-preview/DockHeaderBar.tsx` | Persistent top bar (title, ⌘K button, disable hint). |
| `resources/js/components/finance/tax-preview/TaxEstimateHeader.tsx` | 3-tier estimate (slim one-liner / expanded KPI cards / full modal with brackets + safe-harbor). Exports `summarizeTaxEstimate` + `TaxEstimateFullDetail`. |
| `resources/js/components/finance/tax-preview/formRegistry.ts` | Registry *type* — `FormRegistry`, `FormId` union, `FormCategory`, `Presentation`, `FormRenderProps`, `DrillTarget`. |
| `resources/js/components/finance/tax-preview/registry.tsx` | Registry *instance* — every form's adapter + entry (category, presentation, instances, xlsx contributor). |
| `resources/js/components/finance/tax-preview/DockActions.tsx` | Context for the ⌘K palette open state + worksheet dialog dispatch. |
| `resources/js/components/finance/tax-preview/CommandPalette.tsx` | ⌘K palette; searches registry by keywords/label. |
| `resources/js/components/finance/tax-preview/InstanceTabs.tsx` | Per-column instance tabs (Form 1116 passive/general, etc.). |

---

## Adding a new form

1. **Type**: add the id to the `FormId` union in `formRegistry.ts`.
2. **Adapter**: write a `({ state, onDrill, instance? }) => ReactElement` in `registry.tsx` that reads state and renders the preview component.
3. **Registry entry**: add under `export const formRegistry` with:
   - `id`, `label`, `shortLabel`, `formNumber`, `keywords` (searched by palette)
   - `category`: `'Schedule' | 'Form' | 'Worksheet' | 'App'`
   - `presentation`: `'column'` (push onto stack), `'modal'` (open dialog, no stack change), or `'app'` (landing/singleton)
   - optional `instances.{list, create, allowCreate}` for multi-instance forms (e.g. Form 1116 passive/general)
   - optional `xlsx.{sheetName, order, build}` to contribute an XLSX sheet to the export
4. **Tab mapping**: if the preview component uses a legacy `onTabChange(tab: TaxTabId)` prop, add a `TAB_TO_FORM_ID` entry (see below) so drill works in dock mode.
5. **Tests**: update any test fixtures that iterate the registry (e.g. `MillerShell.test.tsx`, `CommandPalette.test.tsx` stub helpers).

---

## Drill adapter pattern

Preview components were written for the Tabs UI's `onTabChange(tab: TaxTabId) => void`. In dock mode those callbacks are rerouted to `onDrill({ form: FormId })` via a small shim:

```ts
// resources/js/components/finance/tax-tab-ids.ts
export const TAB_TO_FORM_ID: Partial<Record<TaxTabId, string>> = {
  [TAX_TABS.scheduleA]: 'sch-a',
  [TAX_TABS.schedule1]: 'sch-1',
  [TAX_TABS.schedule2]: 'sch-2',
  [TAX_TABS.schedule3]: 'sch-3',
  [TAX_TABS.scheduleE]: 'sch-e',
  [TAX_TABS.scheduleSE]: 'sch-se',
  [TAX_TABS.capitalGains]: 'sch-d',
  [TAX_TABS.form1116]: 'form-1116',
  [TAX_TABS.form6251]: 'form-6251',
  [TAX_TABS.form8582]: 'form-8582',
  [TAX_TABS.form8995]: 'form-8995',
  [TAX_TABS.scheduleC]: 'sch-c',
  [TAX_TABS.actionItems]: 'action-items',
  [TAX_TABS.schedules]: 'sch-b',
}

// resources/js/components/finance/tax-preview/registry.tsx
function tabToDrill(onDrill: (t: DrillTarget) => void) {
  return (tab: TaxTabId) => {
    const formId = TAB_TO_FORM_ID[tab]
    if (formId) onDrill({ form: formId as FormId })
  }
}
```

Usage in an adapter:

```tsx
function Schedule1Adapter({ state, onDrill }: FormRenderProps) {
  return (
    <Schedule1Preview
      selectedYear={state.year}
      schedule1={state.taxReturn.schedule1}
      onTabChange={tabToDrill(onDrill)}
    />
  )
}
```

### Form 1040 line drill

`Form1040Preview` attaches `navTab: TaxTabId` to each line. Clicking a row calls `onNavigate(navTab)`. The Data Source dialog surfaces a "Go to {Schedule}" button using the same `navTab` / `refSchedule` from the clicked row.

Adding a new line? Set `navTab: TAX_TABS.<key>` in `computeForm1040Lines` and make sure the key has a `TAB_TO_FORM_ID` mapping.

### Go-to-source buttons in source dialogs

`AdditionalTaxesPreview.SourceModal` accepts `goToTab` + `goToLabel` + `onTabChange`. The Schedule 2 adapter passes `onTabChange={tabToDrill(onDrill)}`, which makes the "Go to Schedule B / W-2 / Schedule E" buttons push the right column onto the Miller stack.

Tax-preview source navigation is intentionally form-level today:

- Form 1040 line drill uses `navTab` / `TAB_TO_FORM_ID`.
- Action Items source buttons route to the form tab that owns the computation.
- Schedule 2 data-source dialogs route to the contributing form via `goToTab`.
- K-1 trader-fund routing rows currently surface source labels and inline tooltips; deep linking to an exact K-1 code row remains a future improvement.

When adding source navigation, keep the Tabs and Dock paths aligned: legacy components should continue accepting `onTabChange(tab)`, and dock adapters should translate that tab through `tabToDrill(onDrill)`.

---

## URL hash format

```
#/form-1040                           // one column
#/form-1040/sch-1                     // drilled from 1040 into Sch 1
#/form-1040/sch-1/form-1116:passive   // Form 1116 with instance 'passive'
#/form-1116:general                   // multi-instance form directly
```

- `truncateTo(n)` — keep only the first `n` columns (used by close button, Escape key, back-to-parent).
- `pushColumn(target)` — append a column (used when drilling into a new form).
- `replaceFrom(depth, target)` — replace columns from `depth` onward (used when selecting a sibling instance).

---

## Keyboard + interaction rules

- **⌘K / Ctrl+K** — open command palette (registered in `useCommandPaletteShortcut`).
- **Escape** — truncate rightmost column. Ignored when an editable field (input/textarea/select/contenteditable) has focus, or when any Dialog with `data-state="open"` is present (so worksheets handle their own Escape).
- **Back/forward** — navigates the column stack (browser history).

---

## Styling / theme tokens

`resources/js/components/finance/tax-preview-primitives.tsx::CALLOUT_STYLES` uses theme tokens defined in `resources/css/app.css`:

| Kind | Token | Notes |
|------|-------|-------|
| `good` | `--success` | Green — resolved items |
| `warn` | `--warning` | Amber — action-required warnings |
| `info` | `--info` | Teal — informational carryovers |
| `alert` | `--destructive` | Red — must-fix alerts |

Both light and dark variants are defined. Avoid hardcoded palette classes (`bg-green-50`, `bg-amber-50`, etc.) for callouts — they contrast poorly in light mode.

---

## Known gotchas

- **Schedule C home-office cap**: Form 8829 cannot create a net loss. If `home_office_total > (income − expenses)`, net profit clamps to $0 and the excess carries forward. This is why a year with $10k gross receipts + $48k rent can legitimately report $0 on Schedule 1 line 3. See `computeHomeOfficeCalcs` in `ScheduleCPreview.tsx`.
- **Formatter strips unused imports**: the post-edit formatter hook removes unused imports. When adding a type import, include the usage in the same edit, or the import will be removed before you can reference it.
- **Schedule C data shape**: `ScheduleCSummaryService` only emits rows whose tags have a non-empty `tax_characteristic`. Tags without one never appear in Schedule C output.
- **Currency math**: all money math MUST go through `currency.js`. Exported `compute*` functions return plain `number`, never `currency` instances (those aren't JSON-serialisable). See `CLAUDE.md`.
- **Trader-fund K-1s**: Box 11S requires explicit short-term vs. long-term character before Schedule D routing. Ambiguous rows are displayed but excluded from totals until the K-1 code row is set. Box 11ZZ/13ZZ trader-fund ordinary items flow to Schedule E Part II nonpassive.

---

## Related docs

- [tax-system.md](tax-system.md) — legacy Tabs UI and data model
- [README.md](README.md) — finance module index
