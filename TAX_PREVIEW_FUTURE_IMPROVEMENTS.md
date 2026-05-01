# Tax Preview Future Improvements

## Architecture

- Split the Tax Preview provider into smaller domain hooks/providers:
  - tax documents
  - Schedule C / home office
  - tax estimate / derived totals
- Move all Tax Preview API response shapes into shared TypeScript types under `resources/js/types/finance/`.
- Introduce optimistic mutation helpers for review/confirm/edit flows so the provider can update local state immediately and reconcile with the server response.
- Return the updated tax-preview dataset (or a scoped patch) from tax document review/update endpoints to avoid a follow-up GET after every mutation.

## Backend

- Add a dedicated DTO/resource class for `/api/finance/tax-preview-data` so frontend contracts are explicit and testable.
- Add endpoint-level caching for non-user-editable derived sections when safe (for example Schedule C summaries), with cache busting on relevant mutations.
- Expand `ScheduleCSummaryService` to support narrower queries (available-years only, entity-specific only) to avoid unnecessary work.
- Consider a dedicated `TaxPreviewQueryService`/repository layer if the page continues to grow.

## Frontend / UX

- Add loading skeletons per tab instead of a single page-level loading state.
- Persist the Schedule C office/home square-foot inputs so Form 8829 comparisons survive refreshes.
- Add explicit empty/error states per data domain (W-2 docs, account docs, Schedule C, estimates) rather than one shared error banner.
- Add a tab-level dirty-state / last-refreshed indicator to make context refreshes more visible.
- Expand reusable money-input controls backed by `currency.js` for editable fields outside the K-1/tax-preview parsing path.
- Replace remaining plain `<a>` links in Tax Preview-related components with shared UI/link primitives where appropriate.
- Add deeper source drilldowns from Schedule D/E rows directly to the originating K-1 code row in the review modal. Today the app surfaces tab-level "Go to source" navigation and inline row notes, but not row-level modal deep links.

## K-1 / Trader Funds

- Add a first-class review queue item for unclassified Box 11S rows so users can jump from Action Items to the exact K-1 code row that needs ST/LT character.
- Consider persisting a richer `taxCharacter` structure for coded K-1 statement rows if more boxes need explicit ordinary/capital/passive/nonpassive settings beyond the current Box 11S `character` field.
- Add form-level export annotations for Box 11S rows whose character was manually overridden vs. inferred from notes.
- Extend GenAI prompt/test fixtures with more real-world trader-fund supplemental statement formats, especially statements that list short-term and long-term headings separately from the amounts.

## Performance

- Consider lazy-mounting tab panels that are not visible yet.
- Defer heavy K-1/K-3 detail normalization until the user first opens K-1-centric tabs if payload size becomes noticeable.
- Add request deduping / stale-while-revalidate behavior in the Tax Preview provider.

## Testing

- Add frontend tests for the new `TaxPreviewProvider` refresh flows and derived selectors.
- Add feature tests for `/api/finance/tax-preview-data` with seeded payslips/documents/accounts.
- Add browser tests covering year navigation, review refresh sync, and Schedule C tab interactions.
- Add regression tests for the `year=all` handling to ensure the page never resolves to tax year `0`.

## Security / Robustness

- Consider using Laravel JSON script helpers consistently anywhere server state is embedded in Blade.
- Add stricter validation for tax-preview query params and explicit bounds checking on years.
- Audit all tax-preview monetary calculations periodically to ensure `currency.js` remains the only arithmetic path, including display-only summaries and XLSX export helpers.

## State Filings & Deductions (follow-ups to #257)

- Split `isMarried` into MFJ vs. MFS in the marriage-status settings — MFS has a $5k SALT cap and roughly half-MFJ bracket thresholds. Today both collapse to `'Married Filing Jointly'`.
- Extend state support beyond CA/NY: add bracket data to `taxBracket.ts`, state standard deductions to `standardDeductions.ts`, and register the code in both `App\Enums\Finance\TaxState` and `resources/js/lib/tax/supportedStates.ts` (kept in sync manually — consider codegen if the list grows).
- Render full state-return forms (CA-540, NY IT-201) rather than only the TotalsTable bracket summary. Tracked in #256.
- Surface load failures from `/api/finance/user-tax-states` and `/api/finance/user-deductions` via toast instead of console-only logs so failed year loads are visible to the user.
