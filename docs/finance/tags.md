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
| `tax_characteristic` | ENUM / TEXT | Optional tax category code (see below) |
| `employment_entity_id` | BIGINT NULL | FK to `fin_employment_entity` for Schedule C tags |
| `when_added` | TIMESTAMP | Creation timestamp |

**Note on `tax_characteristic` column type:**
- **MySQL**: stored as a native `ENUM` — the database itself rejects invalid values.
- **SQLite** (used in tests): stored as `TEXT` with a `CHECK` constraint that enforces the same allowed values.

Tags are applied to transactions via the `fin_account_line_item_tag_map` join table (many-to-many).

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

### Non-Schedule C Income

These characteristics do **not** require an employment entity link.

| Value | Description |
|-------|-------------|
| `interest` | Interest income (1099-INT) |
| `ordinary_dividend` | Ordinary dividends (1099-DIV) |
| `qualified_dividend` | Qualified dividends (1099-DIV) |
| `other_ordinary_income` | Other ordinary income |

---

## Employment Entity Linking

Tags with Schedule C tax characteristics (`business_income`, `business_returns`, `sce_*`, `scho_*`) can be linked to an employment entity via the `employment_entity_id` column. This groups expenses/income by business for tax reporting.

| Column | Type | Description |
|--------|------|-------------|
| `employment_entity_id` | BIGINT NULL | FK to `fin_employment_entity` (required for Schedule C characteristics) |

**Helper**: `FinAccountTag::isScheduleCCharacteristic($value)` returns `true` if the value requires an entity link.

**Canonical list**: `FinAccountTag::TAX_CHARACTERISTIC_VALUES` (all values) and `FinAccountTag::SCHEDULE_C_CHARACTERISTICS` (Schedule C only).

See [tax-system.md](tax-system.md) for full employment entity documentation.

---

## Managing Tags

**Location**: `/finance/tags` → `resources/js/components/finance/ManageTagsPage.tsx`

The Manage Tags page provides full CRUD for tags:

### Create / Edit Tag Form

Each tag form contains:
- **Label** — unique name (up to 50 characters)
- **Color** — chosen from a color palette
- **Tax Characteristic** — an autocomplete combobox (`TaxCharacteristicCombobox` in `ManageTagsPage.tsx`) implemented with a `Popover` + `Input` search field and a scrollable list, organized into three groups:
  - `Schedule C: Income` — lists `business_income`, `business_returns`
  - `Schedule C: Expense` — lists all `sce_*` values
  - `Schedule C: Home Office Item` — lists all `scho_*` values
  - A "None" option clears the field (`null` in the database)
- Saving a tag patches the updated tag directly into local state to avoid a full page reload flicker.

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

Tags can be applied and removed in multiple places:

### TransactionsTable (single-account or all-accounts view)

Tagging is implemented in the extracted `TransactionsTaggingToolbar` component. When `enableTagging` is `true`:

1. Use the filter inputs to narrow visible transactions.
2. Optionally **select specific rows** (click, Shift+click, Ctrl/Cmd+click) to limit the scope of tag operations.
3. Choose a tag from the **TagSelect** dropdown, then click **Add** to apply the tag, or **Remove** to remove it.
4. Tag operations are **selection-aware**:
   - When rows are selected → operates on the selected rows only (toolbar shows "Action on N selected rows")
   - When no rows are selected → operates on all filtered rows (toolbar shows "Action on all N matching rows")
5. Click **Clear All** to remove all tags from the effective transactions (a confirmation dialog is shown first).
6. When more than 1,000 transactions are in scope, the buttons are disabled and a warning is shown.
7. A **✕ Clear** button appears in the toolbar when rows are selected, allowing quick deselection.

### Transaction Details Modal

When you click a transaction row to open the Transaction Details modal:
- The **Tags** section at the bottom shows all currently applied tags as colored badges.
- Click a badge to remove that tag from the transaction.
- Available tags not yet applied are shown below as "+ TagName" badges; click one to add it.

### All Transactions Page Tag URL Filter

The All Transactions page (`/finance/account/all/transactions`) supports filtering by tag via:
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
| `DELETE` | `/api/finance/tags/{id}` | Delete a tag |
| `POST` | `/api/finance/tags/apply` | Bulk apply a tag to a list of transaction IDs |
| `POST` | `/api/finance/tags/remove` | Bulk remove all of the user's tags from a list of transaction IDs |

### Tag response shape

```json
{
  "data": [
    {
      "tag_id": 1,
      "tag_label": "Office Supplies",
      "tag_color": "blue",
      "tax_characteristic": "sce_office_expenses",
      "employment_entity_id": 5
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
**API Endpoint**: `GET /api/finance/schedule-c[?year=YYYY]`  
**Controller**: `app/Http/Controllers/FinanceTool/FinanceScheduleCController.php`

The Schedule C view aggregates all tagged transactions by their `tax_characteristic` code and groups the results by tax year. It provides a ready-made summary for completing IRS Schedule C (Profit or Loss from Business) and the Home Office Deduction worksheet.

### Page Layout

- **Year selector** (top-right) with −/+ navigation buttons; defaults to the current year.
- **"List transactions in-line" toggle** (Switch) — shows individual transactions indented beneath each line item.
- For each tax year (shown in descending order):
  - **Full-width year header** (`<h2>`) displaying the year
  - **Income table** (shown only when `business_*` tagged transactions exist)
  - **Two side-by-side tables** (50%/50%):
    - **Schedule C Expenses** — sums all `sce_*` tagged transactions for the year
    - **Home Office Deductions** — sums all `scho_*` tagged transactions for the year
  - Each table shows a **Total row** at the bottom
  - **Click any row** to open a Transaction List Modal showing each transaction that contributes to that line, with a link to the transaction in the account's transaction list
  - Amounts are displayed as **positive numbers** (expenses are stored as negative in the database but negated for display)

### API Response Shape

```json
{
  "available_years": ["2024", "2023"],
  "years": [
    {
      "year": "2024",
      "schedule_c_expense": {
        "sce_office_expenses": {
          "label": "Office expenses",
          "total": 1234.56,
          "transactions": [
            { "t_id": 42, "t_date": "2024-03-15", "t_description": "Desk lamp", "t_amt": -200.00, "t_account": 5 }
          ]
        }
      },
      "schedule_c_home_office": {
        "scho_rent": {
          "label": "Rent",
          "total": 14400.00,
          "transactions": [...]
        }
      }
    }
  ]
}
```

- `available_years` always reflects all years that have data, regardless of the `?year` filter.
- Years in the `years` array are sorted **most recent first**.
- Only years with at least one tagged transaction (matching the optional year filter) appear in `years`.
- Tags with `tax_characteristic = null` are excluded.
- Multiple transactions across multiple tags pointing to the same `tax_characteristic` value are aggregated into a single total; individual transactions are included in the `transactions` array.

### Schedule C Navigation

The Schedule C view is accessible from:
- **Finance Sub-Nav** → **Tax Preview**, which includes Schedule C in the Tax Preview dock/legacy tabs
- **API** → `GET /api/finance/schedule-c`

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
- Deleted tag mappings excluded from totals
- Cross-user isolation (other users' transactions not included)
- Unauthenticated request returns 401
- Correct JSON structure including `transactions` sub-array
- Transaction sub-array contains correct `t_id`, `t_date`, `t_account` fields
- Amounts displayed as positive numbers
- Tags with `null` tax_characteristic excluded
- SQLite CHECK constraint rejects invalid `tax_characteristic` values

### Frontend Tests

Tags are covered in the TransactionsTable and ManageTagsPage integration test suites. Run:

```bash
pnpm test -- tests-ts/transactionsTableTags.test.ts
pnpm test -- tests-ts/applyTag.test.tsx
```
