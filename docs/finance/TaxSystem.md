# Tax System

## Overview

The tax system tracks employment entities, links them to transaction tags and payslips, and generates tax-year summaries for Schedule C (self-employment), W-2, and investment income reporting. It also tracks marriage/filing status per year.

See `/database/schema/mysql-schema.sql` for the full database schema. Relevant tables:
- `fin_employment_entity` — W-2 jobs, Schedule C businesses, and hobbies
- `fin_account_tag` — transaction tags with optional `tax_characteristic` and `employment_entity_id`
- `fin_payslip` — payslips linked to employment entities
- `users.marriage_status_by_year` — JSON column with per-year filing status

---

## Employment Entities

Employment entities represent income sources and are stored in `fin_employment_entity`.

**Model**: `app/Models/FinanceTool/FinEmploymentEntity.php`

### Entity Types

| Type | Purpose | Links To |
|------|---------|----------|
| `sch_c` | Self-employment / sole proprietorship | Tags with Schedule C tax characteristics |
| `w2` | W-2 employer | Payslips; tags with W-2 tax characteristics |
| `hobby` | Hobby income (not subject to SE tax) | Tags (optional) |

### Relationships

- `hasMany` → `FinAccountTag` (via `employment_entity_id`) — tags with entity-specific characteristics
- `hasMany` → `FinPayslips` (via `employment_entity_id`) — payslips from W-2 employers

### Security

- A global scope automatically filters by `auth()->id()`, ensuring users only see their own entities.
- The `creating` event auto-sets `user_id` from the authenticated user and prevents cross-user creation.

---

## Tag → Employment Entity Linking

Tags link to employment entities via `employment_entity_id` on `fin_account_tag`. The applicable characteristics depend on entity type:

- **Schedule C** (`sch_c`): `business_income`, `business_returns`, `sce_*`, `scho_*`
- **W-2** (`w2`): `w2_wages`, `w2_other_comp`
- **Other** (no entity): `interest`, `ordinary_dividend`, `qualified_dividend`, `other_ordinary_income`

The Tax Preview page groups Schedule C income/expenses by entity, generating separate Schedule C sections per business.

See [Tags.md](Tags.md) for the full list of tax characteristics and helpers.

---

## Payslip → Employment Entity Linking

Payslips (`fin_payslip` table) link to W-2 employment entities via `employment_entity_id`. This enables:
- Grouping payslips by employer for W-2 reconciliation
- Tracking gross pay, taxes withheld, and deductions per employer per year

---

## Marriage Status

Marriage/filing status is stored per year as a JSON column (`marriage_status_by_year`) on the `users` table. The UI shows all years from the earliest known year through the current year, with missing years defaulting to `false` (single/unmarried). Changes to individual years do not cascade to other years.

### API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/finance/marriage-status` | Get marriage status for all years |
| `POST` | `/api/finance/marriage-status` | Set status for a specific year (`{ year, is_married }`) |

---

## Tax Preview Page

**Routes**: `GET /finance/tax-preview` (canonical), `GET /finance/schedule-c` (301 redirect)
**Component**: `resources/js/components/finance/ScheduleCPage.tsx` (wrapped by `TaxPreviewPage.tsx`)
**Controller**: `app/Http/Controllers/FinanceTool/FinanceScheduleCController.php`

### Features

- **Year selector** with navigation buttons (defaults to current year)
  - Uses URL query string (`?year=YYYY`) so the browser Back button works correctly
  - Pushes browser history on year change; restores from URL on back/forward navigation
- **"List transactions in-line" toggle** — expands individual transactions under each line item
- **Grouped by employment entity** — each `sch_c` entity gets its own Schedule C section
- **Ordinary Income** (interest, dividends, other) shown above Schedule C items
- **Schedule C layout**: 2-3 column grid per entity:
  - Column 1: Schedule C Income
  - Column 2: Schedule C Expenses (includes home office deduction summary)
  - Column 3 (if applicable): Home Office Deduction details
- **Home Office Deduction Summary** in the Expenses column:
  - Prior Year Home Office Carry-Forward (if any)
  - Allowable Home Office Expense (calculated as min of net business income limit)
  - Disallowed Home Office (Carry-Forward to next year)
- **W-2 income** — `w2_wages`, `w2_other_comp` grouped by W-2 entity
- **Non-entity income** — `interest`, `ordinary_dividend`, `qualified_dividend`, `other_ordinary_income`
- All years loaded at once; year selector filters the display client-side
- Amounts displayed as **positive numbers** (negated from stored negative values)
- Click any row to view contributing transactions

### API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/finance/schedule-c` | Tax data grouped by characteristic and year (all years returned; UI filters client-side) |

---

## Employment Entity API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/finance/employment-entities` | List all entities for the authenticated user |
| `POST` | `/api/finance/employment-entities` | Create a new entity |
| `PUT` | `/api/finance/employment-entities/{id}` | Update an entity |
| `DELETE` | `/api/finance/employment-entities/{id}` | Delete an entity |

**Controller**: `app/Http/Controllers/FinanceTool/FinanceEmploymentEntityController.php`

---

## Data Flow Summary

```
Employment Entity (sch_c)
  └── Tags (with sce_*/scho_*/business_* tax_characteristic)
        └── Tagged Transactions → Schedule C tax preview

Employment Entity (w2)
  ├── Payslips → W-2 reconciliation
  └── Tags (with w2_* tax_characteristic) → W-2 income summary

Marriage Status (per year on users table)
  └── Filing status for tax year calculations

Non-entity Tags (interest, dividends, etc.)
  └── Tagged Transactions → Investment income summary (no entity required)
```

---

## Related Documentation

- [Tags.md](Tags.md) — Tag structure, tax characteristics, and tagging API
- [FinanceTool.md](FinanceTool.md) — Finance tool overview and navigation
- [TransactionsTable.md](TransactionsTable.md) — Transaction display and filtering
- `/database/schema/mysql-schema.sql` — Full database schema
