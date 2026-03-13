# Transaction Tags & Tax Reporting

## Overview

Tags provide a flexible, color-coded categorization system for financial transactions. Beyond simple labeling, each tag may carry a **tax characteristic** that classifies the tagged transaction as a specific IRS Schedule C expense or home-office deduction item. This enables automatic tax-year reporting via the Schedule C view.

---

## Tag Structure

Tags are stored in the `fin_account_tag` table:

| Column | Type | Description |
|--------|------|-------------|
| `tag_id` | BIGINT | Primary Key |
| `tag_userid` | VARCHAR(50) | Owner (user ID) |
| `tag_label` | VARCHAR(50) | Display name (unique per user) |
| `tag_color` | VARCHAR(20) | Display color (e.g., `blue`, `red`) |
| `tax_characteristic` | ENUM / TEXT | Optional Schedule C category code (see below) |
| `when_added` | TIMESTAMP | Creation timestamp |
| `when_deleted` | TIMESTAMP NULL | Soft-delete timestamp |

**Note on `tax_characteristic` column type:**
- **MySQL**: stored as a native `ENUM` — the database itself rejects invalid values.
- **SQLite** (used in tests): stored as `TEXT` with a `CHECK` constraint that enforces the same allowed values.

Tags are applied to transactions via the `fin_account_line_item_tag_map` join table (many-to-many, soft-delete aware).

---

## Tag Colors

Tags support 10 predefined colors: `gray`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `indigo`, `purple`, `pink`. Each color is translated into a distinct light/dark pair for accessible badge display.

---

## Tax Characteristics

A tag's `tax_characteristic` classifies it as a particular IRS Schedule C line item. Valid values are grouped into two categories:

### Schedule C: Expense (`sce_*`)

| Value | IRS Label |
|-------|-----------|
| `sce_advertising` | Advertising |
| `sce_car_truck` | Car and truck expenses |
| `sce_commissions_fees` | Commissions and fees |
| `sce_contract_labor` | Contract labor |
| `sce_depletion` | Depletion |
| `sce_depreciation` | Depreciation and Section 179 expense |
| `sce_employee_benefits` | Employee benefit programs |
| `sce_insurance` | Insurance (other than health) |
| `sce_interest_mortgage` | Interest (mortgage) |
| `sce_interest_other` | Interest (other) |
| `sce_legal_professional` | Legal and professional services |
| `sce_office_expenses` | Office expenses |
| `sce_pension` | Pension and profit-sharing plans |
| `sce_rent_vehicles` | Rent or lease (vehicles, machinery, equipment) |
| `sce_rent_property` | Rent or lease (other business property) |
| `sce_repairs_maintenance` | Repairs and maintenance |
| `sce_supplies` | Supplies |
| `sce_taxes_licenses` | Taxes and licenses |
| `sce_travel` | Travel |
| `sce_meals` | Meals |
| `sce_utilities` | Utilities |
| `sce_wages` | Wages |
| `sce_other` | Other expenses |

### Schedule C: Home Office (`scho_*`)

| Value | IRS Label |
|-------|-----------|
| `scho_rent` | Rent |
| `scho_mortgage_interest` | Mortgage interest (business-use portion) |
| `scho_real_estate_taxes` | Real estate taxes |
| `scho_insurance` | Homeowners or renters insurance |
| `scho_utilities` | Utilities |
| `scho_repairs_maintenance` | Repairs and maintenance |
| `scho_security` | Security system costs |
| `scho_depreciation` | Depreciation |
| `scho_cleaning` | Cleaning services |
| `scho_hoa` | HOA fees |
| `scho_casualty_losses` | Casualty losses (business-use portion) |

---

## Managing Tags

**Location**: `/finance/tags` → `resources/js/components/finance/ManageTagsPage.tsx`

The Manage Tags page provides full CRUD for tags:

### Create / Edit Tag Form

Each tag form contains:
- **Label** — unique name (up to 50 characters)
- **Color** — chosen from a color palette
- **Tax Characteristic** — a `<Select>` dropdown (shadcn/ui) organized into two `<SelectGroup>`s:
  - `Schedule C: Expense` — lists all `sce_*` values
  - `Schedule C: Home Office Item` — lists all `scho_*` values
  - A "None" option clears the field (`null` in the database)

### Tags Table

The tags table shows:

| Column | Description |
|--------|-------------|
| Label | Color-coded tag badge |
| Tax Characteristic | Human-readable label for the assigned Schedule C category (blank if none) |
| Totals | Year-by-year and all-time transaction totals for the tag |
| Actions | Edit / Delete buttons |

The Tax Characteristic display uses a client-side `Map` built from all option definitions for O(1) value-to-label lookup.

---

## Applying Tags to Transactions

Tags can be applied in two places:

### TransactionsTable (single-account or all-accounts view)

When `enableTagging` is `true`:
1. Use the filter inputs to narrow visible transactions.
2. Click **Apply Tag** → choose a tag from the dropdown.
3. The tag is applied to all currently-filtered transactions (limit: 1,000 per batch).
4. When more than 1,000 transactions match the filter, the apply buttons are disabled and a warning is shown.

### All Transactions Page Tag URL Filter

The All Transactions page (`/finance/all-transactions`) supports filtering by tag via:
- URL parameter: `?tag=TagName`
- **Select tag** dropdown in the toolbar

---

## Tag API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/finance/tags` | List all tags for the authenticated user |
| `GET` | `/api/finance/tags?include_counts=true` | Include per-tag transaction counts |
| `GET` | `/api/finance/tags?totals=true` | Include per-tag year-by-year totals |
| `POST` | `/api/finance/tags` | Create a new tag |
| `PUT` | `/api/finance/tags/{id}` | Update a tag (label, color, tax_characteristic) |
| `DELETE` | `/api/finance/tags/{id}` | Soft-delete a tag |
| `POST` | `/api/finance/tags/apply` | Bulk apply a tag to a list of transaction IDs |

### Tag response shape

```json
{
  "data": [
    {
      "tag_id": 1,
      "tag_label": "Office Supplies",
      "tag_color": "blue",
      "tax_characteristic": "sce_office_expenses"
    }
  ]
}
```

**Validation**: `tax_characteristic` must be one of the allowed enum values listed above, or `null`. The controller uses a Laravel `in:` rule sourced from `FinAccountTag::TAX_CHARACTERISTIC_VALUES`.

**Controller**: `app/Http/Controllers/FinanceTool/FinanceTransactionTaggingApiController.php`

---

## Schedule C View

**Route**: `GET /finance/schedule-c`  
**Component**: `resources/js/components/finance/ScheduleCPage.tsx`  
**API Endpoint**: `GET /api/finance/schedule-c`  
**Controller**: `app/Http/Controllers/FinanceTool/FinanceScheduleCController.php`

The Schedule C view aggregates all tagged transactions by their `tax_characteristic` code and groups the results by tax year. It provides a ready-made summary for completing IRS Schedule C (Profit or Loss from Business) and the Home Office Deduction worksheet.

### Page Layout

For each tax year (shown in descending order):
- **Full-width year header** (`<h2>`) displaying the year
- **Two side-by-side tables** (50%/50%):
  - **Schedule C Expenses** — sums all `sce_*` tagged transactions for the year
  - **Home Office Deductions** — sums all `scho_*` tagged transactions for the year
- Each table shows a **Total row** at the bottom
- Amounts are displayed as **positive numbers** (expenses are stored as negative in the database but negated for display)

### API Response Shape

```json
{
  "years": [
    {
      "year": "2024",
      "schedule_c_expense": {
        "sce_office_expenses": { "label": "Office expenses", "total": 1234.56 },
        "sce_meals": { "label": "Meals", "total": 456.78 }
      },
      "schedule_c_home_office": {
        "scho_rent": { "label": "Rent", "total": 14400.00 }
      }
    }
  ]
}
```

- Years are sorted **most recent first**.
- Only years with at least one tagged transaction appear in the response.
- Tags with `tax_characteristic = null` (or soft-deleted tags/mappings) are excluded.
- Multiple tags pointing to the same `tax_characteristic` value are summed together.

### Schedule C Navigation

The Schedule C view is accessible from:
- **Main navbar** → Finance dropdown → *Schedule C View*
- **Finance Sub-Nav** → between *All Transactions* and *RSU*

---

## Testing

### PHP Unit Tests

```bash
php artisan test --filter=FinanceScheduleCControllerTest
```

**Test coverage** (11 tests):
- Empty response when no Schedule C tags exist
- Expense totals grouped correctly by year (multi-year)
- Home office totals returned correctly
- Multiple tags with the same `tax_characteristic` are aggregated
- Soft-deleted tag mappings excluded from totals
- Cross-user isolation (other users' transactions not included)
- Unauthenticated request returns 401
- Correct JSON structure
- Amounts displayed as positive numbers
- Tags with `null` tax_characteristic excluded
- SQLite CHECK constraint rejects invalid `tax_characteristic` values

### Frontend Tests

Tags are covered in the TransactionsTable and ManageTagsPage integration test suites. Run:

```bash
pnpm test -- tests-ts/transactionsTableTags.test.ts
pnpm test -- tests-ts/applyTag.test.tsx
```
