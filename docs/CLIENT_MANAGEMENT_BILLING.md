# Client Management - Billing & Invoicing System

## Overview
The billing and invoicing system handles automatic invoice generation with prior-month billing, retainer-based pricing, rollover hours, and reimbursable expense tracking. Invoices are generated at the start of month M and include work from the prior month (M-1) plus the retainer fee for the current month (M).

## Core Concepts

### Prior-Month Billing Model
When an invoice is generated for month M (e.g., February 2024):
- **Work Period (M-1)**: The invoice `period_start` and `period_end` represent the month work was performed (e.g., Jan 1 - Jan 31).
- **Time entries from month M-1** are included and generally dated as the last day of M-1. These are covered by the available pool (retainer + rollover).
- **Retainer fee for month M** is included and dated as the first day of M.
- **Reimbursable expenses** up to the invoice generation date are included with their original dates.

This model ensures work is billed after completion, while the retainer fee provides availability for the upcoming month.

### Rollover Hours
Unused retainer hours can roll over to future months (configurable via `rollover_months` in agreements). The calculation uses a chronological balance pool:
- **rollover_months = 0**: No rollover; unused hours are lost
- **rollover_months = 1**: Hours can only be used in the month they're earned  
- **rollover_months = 2+**: Hours roll over for N-1 additional months
- **Negative Balance**: If hours worked exceed available pool, the difference is carried forward as a negative balance rather than billed immediately, UNLESS the Minimum Availability Rule is triggered.

### Minimum Availability Rule (Catch-up Billing)
To ensure the client always has capacity for new work, the system enforces a minimum availability of **1 hour** at the start of a billing period.

**Logic:**
1. Calculate Net Availability: `(Retainer Hours for Month M) - (Negative Balance Carried from M-1)`
2. If Net Availability < 1 hour:
   - Calculate deficit: `1 - Net Availability`
   - Generate an invoice line item (`additional_hours`) for this catch-up amount.
   - Bill at the hourly rate.
   - Reduce the carried-forward negative balance by the catch-up amount (effectively "paying off" the debt).
   - Set the starting "Unused Hours" balance to 1 hour.

**Example:**
- Jan: Retainer 2h, Worked 10h. Result: -8h balance carried to Feb.
- Feb: Retainer 2h.
  - Net Availability = 2h - 8h = -6h.
  - Rule: Must have 1h available.
  - Catch-up needed: 1h - (-6h) = 7h.
  - Invoice triggers 7h billing @ hourly rate.
  - Final Feb Status: Starts with 1h available.

### Hourly Rate Determination
While most hours are covered by the pool at $0 additional cost, any manual line items or eventual overage billing uses the hourly rate from the **active agreement for the invoice month (M)**.

## Invoice Line Items
Generated invoices contain the following line item types (in order):

1. **Prior-Month Work** (`prior_month_retainer`): Time entries from M-1. In the "give and take" model, these are generally included at $0, dated last day of M-1. Shows total hours in the description and links to time entries with their original dates. Quantity is blank/empty (hours are documented in the description).
   - Split Logic: If prior month work exceeds what was covered by M-1 retainer and M retainer, it is split into multiple line items (Covered by M-1, Covered by M, Carried Forward).

2. **Retainer Fee** (`retainer`): Monthly retainer fee for month M. Description includes the date (e.g., "Monthly Retainer (10 hours) - Feb 1, 2024"). Dated first day of M. Quantity is "1".

3. **Catch-up / Additional Hours** (`additional_hours`): Used for "Catch-up Billing" (Minimum Availability Rule) or manual overage. Billed at hourly rate.

4. **Balance Update** (`credit`): Informational $0 line showing rollover hours used or negative balance carried forward.

5. **Expenses** (`expense`): Reimbursable expenses incurred up to the invoice date. Each expense line uses its original expense date. Quantity is "1".

6. **Milestone Tasks** (`milestone`): Completed billable tasks with a non-zero `milestone_price`. Each task generates a separate line item dated with its completion date. See [Milestone Billing](#milestone-billing) below.

## Invoice Period
The invoice `period_start` and `period_end` specifically represent the **work period** being billed (usually M-1):
- **period_start**: The first day of the work month (e.g., 2024-01-01).
- **period_end**: The last day of the work month (e.g., 2024-01-31).

Unlike the previous implementation, the retainer fee line (dated the 1st of M) does **not** expand the invoice period. This prevents overlapping period errors when generating subsequent work invoices.

## Invoice Balance Fields
The invoice tracks several balance fields that reflect the state at different points in time:

### Server serialization & portal hydration
- The server now exposes a **single canonical serializer** for detailed invoices (`ClientInvoice::toDetailedArray()`), used by the admin API and the portal Blade hydration.
- Blade-embedded JSON omits explicit `null` values (keys may be absent on the client). The client treats missing keys as `undefined` and performs tolerant validation + normalization.
- Monetary totals and payment amounts may be emitted as numbers by the server; the client accepts numeric/string unions and normalizes them to the expected string formats for runtime validation and display.
- Hydration includes `hours_billed_at_rate` ("Catch-up Hours Billed") and `unused_hours_balance` (remaining retainer pool) so the portal's Hourly Summary can render these tiles immediately (0:00 is shown when values are zero).


### Work Period Balances (End of Month M-1)
These fields reflect the state **after** processing all work performed in the work period (M-1) but **before** the retainer for Month M is applied. These are primarily used for historical reporting and test validation.

- **`unused_hours_balance`**: Unused hours remaining from the Month M-1 pool after processing all work in that month.
- **`negative_hours_balance`**: Negative hours (debt) carried forward from the Month M-1 work period.
- **`rollover_hours_used`**: Hours from previous months' rollover that were used during the work period (M-1).
- **`hours_billed_at_rate`**: Additional hours billed at the hourly rate (catch-up billing or manual overages).

### Starting Balances (Start of Month M)
These fields reflect the "Starting Pool" for the upcoming month (M), providing the client with a clear picture of their available capacity after accounting for the current invoice's retainer and catch-up billing.

- **`starting_unused_hours`**: Net availability at the start of Month M. This includes the retainer for Month M, minus any remaining debt from M-1, plus any buffer added by the Minimum Availability Rule (catch-up).
- **`starting_negative_hours`**: Any remaining negative hours (debt) that could not be cleared by the retainer for Month M or by catch-up billing.

These balances are calculated to ensure the client has a predictable starting point for the next billing cycle.

## Billing Validation & Automation

### Time Entry Validation
To maintain the integrity of financial records, the system enforces the following rules in the Client Portal:
- **Block Edits/Deletes on Issued Invoices**: Users cannot edit or delete time entries linked to invoices with **Issued** or **Paid** status.
- **Allow Edits/Deletes on Draft Invoices**: Time entries linked to **Draft** (upcoming) invoices CAN be edited or deleted. The entry is automatically unlinked and the draft invoice is regenerated.
- **Block New Entries in Issued Periods**: Users cannot create new time entries for a date within an **Issued** or **Paid** invoice period.

### Automatic Draft Invoice Regeneration
Draft invoices are automatically regenerated when time entries change:
- **On Create**: When a new time entry is added for a date covered by a draft invoice, that invoice is regenerated.
- **On Update**: When a time entry on a draft invoice is modified, the entry is unlinked and the invoice is regenerated.
- **On Delete**: When a time entry on a draft invoice is deleted, the entry is unlinked and the invoice is regenerated.

This ensures draft/upcoming invoices always reflect the current state of time entries.

## Draft Invoice Regeneration
When regenerating a draft invoice (e.g., when new time entries are added):
- All system-generated line items are deleted (retainer, prior_month_retainer, prior_month_billable, additional_hours, credit, expense, milestone)
- All linked time entries, expenses, and milestone tasks are unlinked (their `client_invoice_line_id` set to null)
- New line items are generated with updated calculations
- Manual adjustments (line_type = 'adjustment') are preserved

## Milestone Billing

### Overview
Tasks can be designated as billable milestones by setting a non-zero `milestone_price` (currency, e.g., $500.00). This allows flat-fee billing for specific deliverables, independently of time entries.

### How It Works
1. An admin sets the `milestone_price` field on a task (minimum $0.00, rounded to nearest cent).
2. When the task is marked **completed**, it becomes eligible for billing.
3. During invoice generation, all unbilled completed tasks with `milestone_price > 0` whose `completed_at` date falls on or before the invoice's `period_end` are added as `milestone` line items.
4. If a task was completed in a period where the corresponding invoice is already **Issued** or **Paid**, the task is automatically carried forward to the next available draft or new invoice.
5. The task's `client_invoice_line_id` is set to reference the invoice line it was billed on.

### Invoice Generation Workflow with Tasks

When running "Generate Invoices" via the admin interface:

1. **Draft Invoice Detection**: The system finds or creates draft invoices for each billing period.
2. **Task Collection**: For each invoice period, the system identifies all completed, unbilled tasks (`milestone_price > 0`, `client_invoice_line_id IS NULL`, `completed_at <= period_end`).
3. **Draft Invoice Updates**: If a draft invoice already exists for the period, it is regenerated to include any newly completed tasks.
4. **Carry-Forward Logic**: If a task's completion date falls within a period that already has an **Issued** or **Paid** invoice, the task is automatically added to the next available **Draft** invoice instead.
5. **Immutability**: Non-draft invoices (Issued, Paid, Void) are **NEVER** modified. Their milestone line items remain locked and unchanged.

This ensures that completed billable tasks are always captured on an invoice, even if their natural period has already been finalized.

### Visual Indicator
Tasks with a non-zero `milestone_price` display a **green badge** showing the price (e.g., `$500.00`). Completed tasks that have been invoiced show a `✓` in the badge.

### Invoice Deletion & Task Unlinking
When an invoice is soft-deleted (or a draft is regenerated):
- The `client_invoice_line_id` on associated tasks is automatically set to `null`.
- This allows the tasks to be billed again on the next invoice.

This behavior is implemented via Eloquent model events on `ClientInvoiceLine` (the `deleting` event unlinks tasks).

### Milestone Price Editing
Only admin users can set or modify the `milestone_price` field. Non-admin users cannot set this field via the API (it is silently ignored for non-admins).


## Time Entry Detail Display
The invoice page includes a "Show Detail" toggle switch in the top-right corner (default: ON). When enabled, it displays the underlying time entry descriptions for each line item as an indented bullet list, showing the description, hours, and original date_worked for each entry.

## Time Entry Badge Display
On the time entries page, each billable entry linked to an invoice shows a badge:
- **Upcoming** (blue): Entry is on a **draft** invoice — clickable link to the draft invoice
- **Invoiced** (green): Entry is on an **issued** or **paid** invoice — clickable link to the issued invoice
- **BILLABLE** / **NON-BILLABLE**: Entry is not yet linked to any invoice

Entries on draft invoices remain fully editable (edit button visible, row clickable). Only entries on issued/paid invoices are locked.

## Page Title
The invoice page title includes the invoice number for easy identification (e.g., "Invoice ABC-202402-001 - Company Name").

## Payment Handling

### Payment Methods
Supported payment methods:
- Credit Card
- ACH
- Wire
- Check
- Other

### Payment Validation
The system enforces strict payment validation to maintain data integrity:

1. **Overpayment Prevention**: 
   - When adding a new payment, the amount cannot exceed the invoice's remaining balance
   - When updating an existing payment, the total payments cannot exceed the invoice total
   - Both endpoints return HTTP 422 with a descriptive error message if validation fails

2. **Payment Amount Rules**:
   - Minimum payment amount: $0.01
   - Payment amounts must be numeric
   - Payment date is required and must be a valid date

### Invoice Status Transitions

The invoice status automatically updates based on payment activity:

1. **Draft → Issued**: Manual action by admin (sets `issue_date`)
2. **Issued → Paid**: Automatically triggered when `total_payments >= invoice_total`
   - `paid_date` is set to the latest payment date
   - Status changes from "issued" to "paid"
3. **Paid → Issued**: Automatically triggered when a payment is deleted or updated, causing `remaining_balance > 0`
   - `paid_date` is cleared
   - Status reverts to "issued"

### Partially Paid Status

While the database status remains "issued", the UI displays a special "PARTIALLY PAID" badge (blue background) when:
- Invoice status is "issued", AND
- Total payments > 0, AND
- Remaining balance > 0

This provides clear visual feedback that payment has been received but is not yet complete.

### Payment Table Display

The payments table on the invoice detail page uses a compact style consistent with line items:
- Rows are clickable to edit payments (admin only)
- Edit icon appears on hover in the rightmost column
- Each row shows: payment date, amount, method, and notes
- When invoice is fully paid (status = 'paid'), the "Add Payment" button is hidden

### Payment Workflow (Admin Only)

1. **Add Payment**: Click "Add Payment" button → Modal opens with default amount = remaining balance
2. **Edit Payment**: Click payment row or hover edit icon → Modal opens with current values
3. **Delete Payment**: Open payment modal → Click "Delete" button
4. **Validation**: System prevents overpayment at API level with user-friendly error messages
