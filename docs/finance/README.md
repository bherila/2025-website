# Finance Module — Documentation Index

Start here when you need to orient yourself in the finance codebase. Each doc below focuses on one subsystem; follow the cross-links to go deeper.

## Quick map

| Area | Doc | Start-here path |
|------|-----|-----------------|
| Big picture + routes | [overview.md](overview.md) | `app/Http/Controllers/FinanceTool/` + `resources/js/components/finance/` |
| Accounts + balance | [account-matching.md](account-matching.md) | `app/Models/FinanceTool/FinAccount.php` |
| Tags + characteristics | [tags.md](tags.md) | `app/Models/FinanceTool/FinAccountTag.php::TAX_CHARACTERISTICS` |
| Transactions table UI | [transactions-table.md](transactions-table.md) | `resources/js/components/finance/TransactionsPage.tsx` |
| CSV statement import | [import.md](import.md), [csv-parsers.md](csv-parsers.md), [statements.md](statements.md) | `app/Services/Finance/Parsers/` |
| Auto-tagging rules | [rules-engine.md](rules-engine.md) | `app/Services/Finance/RulesEngineService.php` |
| Payslips (W-2 prep) | [payslips.md](payslips.md) | `app/Models/FinanceTool/FinPayslips.php` |
| Lot accounting + short-div | [lot-analyzer.md](lot-analyzer.md) | `app/Services/Finance/LotAnalyzer*` |
| Tax system (Tabs UI + data) | [tax-system.md](tax-system.md) | `resources/js/components/finance/TaxPreviewPage.tsx` |
| **Tax Preview — Dock UI** | **[tax-preview-dock.md](tax-preview-dock.md)** | `resources/js/components/finance/tax-preview/` |
| CLI (artisan commands) | [cli.md](cli.md) | `app/Console/Commands/Finance*` |
| MCP server (AI tools) | [mcp-server.md](mcp-server.md) | `app/Mcp/` |

## How to find things fast

- **"Where does X live?"** — grep the service/model name. Models live under `app/Models/FinanceTool/`, controllers under `app/Http/Controllers/FinanceTool/`, and pages under `resources/js/components/finance/`.
- **"How does Schedule Z get its value?"** — start in `resources/js/components/finance/TaxPreviewContext.tsx`; it fetches the consolidated dataset and runs `compute*` functions. From there, jump into the specific preview file (`Schedule1Preview.tsx`, `Form1040Preview.tsx`, etc.).
- **"Where are the Schedule C tax characteristics defined?"** — `app/Models/FinanceTool/FinAccountTag.php::TAX_CHARACTERISTICS`. Categories are `sch_c_income`, `sch_c_expense`, `sch_c_home_office`, `other`, `w2_income`.
- **"How do I add a new form to the dock UI?"** — see [tax-preview-dock.md § Adding a new form](tax-preview-dock.md#adding-a-new-form).
- **"Where do the XLSX export sheets come from?"** — the `xlsx` field on each `FormRegistryEntry` in `resources/js/components/finance/tax-preview/registry.tsx`. The builders themselves live in `resources/js/lib/finance/buildTaxWorkbook.ts`.

## Global rules

- **Money math**: always `currency.js` — never raw `+ - * /` on dollar values. Exported compute functions return plain `number`, never `currency` objects. See `CLAUDE.md`.
- **Authentication**: all finance endpoints are behind `web + auth` middleware; models apply a `auth()->id()` global scope.
- **Testing**: every change must pass `pnpm run type-check`, `pnpm run lint`, `pnpm exec jest`, `vendor/bin/pint`, and `php artisan test --compact`. See `TESTING.md` in the repo root.

## Conventions worth knowing

- Finance routes live in `routes/api.php` and `routes/web.php`; the tool mounts under `/finance/*`.
- Views in `resources/views/finance/` extend `layouts.finance.blade.php` (skips the main site navbar; renders `<FinanceNavbar>` React component instead).
- Column naming: database columns are snake_case (`t_date`, `t_amt`, `acct_owner`), but API responses + TypeScript types are usually camelCase or domain-specific (`schedule_c_income`, `box1_wages`).
- React components under `resources/js/components/finance/` mostly use the presenter pattern: pure `compute*` functions in the same file, a default-exported presentational component, plus test files under `__tests__/`.
