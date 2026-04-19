# Deferred Billing

## What it does

Admins can flag any billable time entry as **deferred**. A deferred entry is completed work that should **not** be billed on the usual next invoice — it waits on the shelf until there is free retainer capacity in a future period.

Unlike regular entries, deferred entries:

- **Are never split.** If only 5h of retainer capacity remains and a deferred entry is 7h, it stays unbilled — it is *not* split into 5h+2h.
- **Never trigger catch-up billing.** The Minimum Availability Rule (see [billing.md](billing.md#minimum-availability-rule-catch-up-billing)) is computed ignoring deferred entries; they cannot push the agreement into debt.
- **Never expire on their own.** A deferred entry may sit unbilled for many months if capacity doesn't open up. It carries forward indefinitely.
- **Are force-billed on agreement termination.** When an agreement is terminated, the final invoice includes every outstanding deferred entry billed at the **hourly rate**. This guarantees the client is never left with unbilled work after the relationship ends.

## Data model

A single boolean on `client_time_entries`:

| column | type | default | notes |
| --- | --- | --- | --- |
| `is_deferred_billing` | `BOOLEAN` | `false` | Indexed. Only meaningful when `is_billable = true`. |

The flag is set only by admins (the portal API validates this). Clients cannot self-defer work.

## Allocation logic

`App\Services\ClientManagement\DeferredBillingAllocator` runs after the normal time-entry splitter, at invoice generation time:

1. Load all unbilled (`client_invoice_line_id IS NULL`), billable, `is_deferred_billing = true` entries with `date_worked <= period_end`.
2. Compute `remainingCapacity = (priorMonthRetainerCapacity − priorAllocated) + (currentMonthRetainerCapacity − currentAllocated)`.
3. Sort candidates by `date_worked ASC, id ASC` (deterministic FIFO).
4. Greedily include any candidate whose `hours <= remainingCapacity`, subtracting from remaining capacity each time.
5. Skip candidates that don't fit. They stay unlinked and remain available to the next invoice.

Included entries are attached to a single `prior_month_retainer` invoice line titled *"Deferred work items applied to retainer (X:XX)"*. Skipped entries are exposed in the invoice detail payload as a "deferred to future invoice" note so admins can see what is pending.

## Termination path

When generating a post-termination invoice (`isRetainerMonthPostTermination = true`), the allocator switches modes: it selects **all** outstanding deferred entries (no capacity filter) and attaches them to a single `additional_hours` line priced at `agreement.hourly_rate`. `hours_billed_at_rate` on the invoice is incremented so the existing balance-snapshot math stays correct.

## Regeneration

Draft invoices auto-regenerate whenever a time entry in their period changes (see [billing.md](billing.md#draft-invoice-regeneration)). The regeneration flow already:

1. Deletes system-generated line items.
2. Unlinks attached time entries.
3. Re-runs invoice generation, which re-invokes the deferred allocator.

No special handling is needed. A deferred entry that fit on last night's draft may be bumped to next month if someone adds a non-deferred entry that consumes the capacity. Conversely, a skipped deferred entry from last night can show up on the redrawn draft if capacity opens up. All of this happens automatically.

## UI

- **New Time Entry / Edit Time Entry modal** (admin only): a "Defer billing" checkbox appears under "Billable". It is disabled and cleared when "Billable" is off.
- **Time entry list**: entries with `is_deferred_billing = true` render a small "Deferred" badge.
- **Invoice detail page**: after the main line-item table, a "Deferred to future invoice" section lists any outstanding deferred entries for this period so admins know what's pending.

## Invariants & tests

- Issued/Paid/Void invoices are never modified after the fact, even if new deferred entries are created in their period.
- Deferred entries are never split (hard invariant; covered by `DeferredBillingAllocatorTest::test_never_splits`).
- Termination invoices include every outstanding deferred entry (`test_termination_force_bills_all_deferred`).

See `tests/Feature/ClientManagement/DeferredBillingAllocatorTest.php`.
