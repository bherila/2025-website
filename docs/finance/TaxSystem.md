# Tax System

## Overview

The tax system tracks employment entities, links them to transaction tags and payslips, and generates tax-year summaries for Schedule C (self-employment), W-2, and investment income reporting. It also tracks marriage/filing status per year.

---

## Employment Entities

Employment entities represent income sources and are stored in `fin_employment_entity`.

### Table Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `user_id` | BIGINT | Owner (auto-set from auth) |
| `display_name` | VARCHAR | Business or employer name |
| `type` | ENUM | `sch_c` (Schedule C), `w2` (W-2 employer), `hobby` |
| `ein` | VARCHAR | Employer Identification Number |
| `address` | TEXT | Business/employer address |
| `start_date` | DATE | Start of employment/business |
| `end_date` | DATE | End (null if current) |
| `is_current` | BOOLEAN | Currently active |
| `is_spouse` | BOOLEAN | Whether this is the spouse's entity |
| `sic_code` | INTEGER | Standard Industrial Classification code (Schedule C) |

**Model**: `app/Models/FinanceTool/FinEmploymentEntity.php`

### Entity Types

| Type | Purpose | Links To |
|------|---------|----------|
| `sch_c` | Self-employment / sole proprietorship | Tags with Schedule C tax characteristics |
| `w2` | W-2 employer | Payslips |
| `hobby` | Hobby income (not subject to SE tax) | Tags (optional) |

### Relationships

- `hasMany` → `FinAccountTag` (via `employment_entity_id`) — tags with Schedule C characteristics
- `hasMany` → `FinPayslips` (via `employment_entity_id`) — payslips from W-2 employers

### Security

- A global scope automatically filters by `auth()->id()`, ensuring users only see their own entities.
- The `creating` event auto-sets `user_id` from the authenticated user and prevents cross-user creation.

---

## Tag → Employment Entity Linking

Tags with **Schedule C tax characteristics** (`business_income`, `business_returns`, `sce_*`, `scho_*`) are linked to a `sch_c` employment entity via the `employment_entity_id` column on `fin_account_tag`.

This allows the Tax Preview page to group Schedule C income and expenses by business entity, generating separate Schedule C forms per entity.

**Non-Schedule C characteristics** (`interest`, `ordinary_dividend`, `qualified_dividend`, `other_ordinary_income`) do **not** require an employment entity link.

See [Tags.md](Tags.md) for the full list of tax characteristics and the `isScheduleCCharacteristic()` helper.

---

## Payslip → Employment Entity Linking

Payslips (`fin_payslip` table) link to W-2 employment entities via `employment_entity_id`. This enables:
- Grouping payslips by employer for W-2 reconciliation
- Tracking gross pay, taxes withheld, and deductions per employer per year

---

## Marriage Status

Marriage/filing status is stored per year as a JSON column on the `users` table.

### Storage

| Column | Type | Description |
|--------|------|-------------|
| `marriage_status_by_year` | JSON | `{ "2024": "married_filing_jointly", "2023": "single", ... }` |

### Valid Statuses

- `single`
- `married_filing_jointly`
- `married_filing_separately`
- `head_of_household`
- `qualifying_widow`

### API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/finance/marriage-status` | Get marriage status for all years |
| `POST` | `/api/finance/marriage-status` | Set status for a specific year (`{ year, status }`) |

---

## Tax Preview Page

**Route**: `GET /finance/schedule-c`
**Component**: `resources/js/components/finance/ScheduleCPage.tsx`
**Controller**: `app/Http/Controllers/FinanceTool/FinanceScheduleCController.php`

> **Note**: The route is still `/finance/schedule-c` but the page now serves as a general Tax Preview, covering Schedule C, investment income, and W-2 summaries grouped by employment entity.

### Features

- **Year selector** with navigation buttons (defaults to current year)
- **"List transactions in-line" toggle** — expands individual transactions under each line item
- **Grouped by employment entity** — each `sch_c` entity gets its own Schedule C section
- **Income table** — `business_income` and `business_returns` aggregated
- **Schedule C Expenses** — all `sce_*` characteristics summed
- **Home Office Deductions** — all `scho_*` characteristics summed
- **Non-Schedule C income** — `interest`, `ordinary_dividend`, `qualified_dividend`, `other_ordinary_income`
- Amounts displayed as **positive numbers** (negated from stored negative values)
- Click any row to view contributing transactions

### API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/finance/schedule-c?year=YYYY` | Tax data grouped by characteristic and year |

See [Tags.md](Tags.md#schedule-c-view) for the full API response shape.

---

## Employment Entity API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/finance/employment-entities` | List all entities for the authenticated user |
| `POST` | `/api/finance/employment-entities` | Create a new entity |
| `PUT` | `/api/finance/employment-entities/{id}` | Update an entity |
| `DELETE` | `/api/finance/employment-entities/{id}` | Delete an entity |

**Controller**: `app/Http/Controllers/FinanceTool/FinanceEmploymentEntityController.php`

### Request Body (POST/PUT)

```json
{
  "display_name": "My Consulting LLC",
  "type": "sch_c",
  "ein": "12-3456789",
  "address": "123 Main St",
  "start_date": "2023-01-01",
  "end_date": null,
  "is_current": true,
  "is_spouse": false,
  "sic_code": 7372
}
```

### Validation

- `display_name` — required, string
- `type` — required, must be one of `sch_c`, `w2`, `hobby`
- `ein`, `address` — optional strings
- `start_date`, `end_date` — optional dates (YYYY-MM-DD)
- `is_current`, `is_spouse` — optional booleans

---

## Data Flow Summary

```
Employment Entity (sch_c)
  └── Tags (with sce_*/scho_*/business_* tax_characteristic)
        └── Tagged Transactions → Schedule C tax preview

Employment Entity (w2)
  └── Payslips → W-2 reconciliation

Marriage Status (per year on users table)
  └── Filing status for tax year calculations

Non-Schedule C Tags (interest, dividends, etc.)
  └── Tagged Transactions → Investment income summary (no entity required)
```

---

## Related Documentation

- [Tags.md](Tags.md) — Tag structure, tax characteristics, and tagging API
- [FinanceTool.md](FinanceTool.md) — Finance tool overview and navigation
- [TransactionsTable.md](TransactionsTable.md) — Transaction display and filtering
