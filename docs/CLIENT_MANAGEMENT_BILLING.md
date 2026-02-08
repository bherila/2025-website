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

1. **Prior-Month Work** (`prior_month_retainer`): Time entries from M-1. In the "give and take" model, these are generally included at $0, dated last day of M-1. Shows total hours and links to time entries with their original dates. Quantity is ALWAYS formatted as "h:mm".
   - Split Logic: If prior month work exceeds what was covered by M-1 retainer and M retainer, it is split into multiple line items (Covered by M-1, Covered by M, Carried Forward).

2. **Retainer Fee** (`retainer`): Monthly retainer fee for month M. Description includes the date (e.g., "Monthly Retainer (10 hours) - Feb 1, 2024"). Dated first day of M. Quantity is "1".

3. **Catch-up / Additional Hours** (`additional_hours`): Used for "Catch-up Billing" (Minimum Availability Rule) or manual overage. Billed at hourly rate.

4. **Balance Update** (`credit`): Informational $0 line showing rollover hours used or negative balance carried forward.

5. **Expenses** (`expense`): Reimbursable expenses incurred up to the invoice date. Each expense line uses its original expense date. Quantity is "1".

## Invoice Period
The invoice `period_start` and `period_end` specifically represent the **work period** being billed (usually M-1):
- **period_start**: The first day of the work month (e.g., 2024-01-01).
- **period_end**: The last day of the work month (e.g., 2024-01-31).

Unlike the previous implementation, the retainer fee line (dated the 1st of M) does **not** expand the invoice period. This prevents overlapping period errors when generating subsequent work invoices.

## Invoice Balance Fields
The invoice tracks several balance fields that reflect the state at the **start of the retainer month (Month M)**, after accounting for all work performed in the work period (M-1) and any catch-up billing triggered:

- **`unused_hours_balance`**: Net availability at the start of Month M. This includes the retainer for Month M, minus any remaining debt from M-1, plus any buffer added by the Minimum Availability Rule.
- **`negative_hours_balance`**: Any remaining negative hours (debt) that could not be cleared by the retainer for Month M or by catch-up billing. 
- **`rollover_hours_used`**: Hours from previous months' rollover that were used during the work period (M-1).
- **`hours_billed_at_rate`**: Additional hours billed at the hourly rate (catch-up billing or manual overages).

These balances are calculated to reflect the "Starting Pool" for the upcoming month (M), providing the client with a clear picture of their available capacity after the current invoice is paid.

## Billing Validation & Automation

### Time Entry Validation
To maintain the integrity of financial records, the system enforces the following rules in the Client Portal:
- **Block Edits/Deletes**: Users cannot edit or delete time entries if they are linked to an invoice with **Issued**, **Paid**, or **Void** status.
- **Block New Entries**: Users cannot create new time entries for a date that falls within the period of an already **Issued** invoice.

### Automatic Draft Generation
To ensure a continuous billing cycle:
- When a user logs a time entry for a date past the current `period_end` of existing invoices, the system automatically triggers the generation of a **Draft** invoice for that next work period.
- This ensures that a "bucket" (retainer pool) is always ready to receive work entries.

## Draft Invoice Regeneration
When regenerating a draft invoice (e.g., when new time entries are added):
- All system-generated line items are deleted (retainer, prior_month_retainer, prior_month_billable, additional_hours, credit, expense)
- All linked time entries and expenses are unlinked
- New line items are generated with updated calculations
- Manual adjustments (line_type = 'adjustment') are preserved

## Time Entry Detail Display
The invoice page includes a "Show Detail" toggle switch in the top-right corner (default: ON). When enabled, it displays the underlying time entry descriptions for each line item as an indented bullet list, showing the description, hours, and original date_worked for each entry.

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
