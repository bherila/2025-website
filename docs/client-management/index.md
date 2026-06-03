# Client Management

Admin-only feature for managing client companies, their users, agreements, time tracking, expenses, milestones, and invoicing. Includes both an admin UI and a client-facing portal.

## Quick links

- **[Overview](overview.md)** — architecture, schema, models, controllers, routes, and workflows.
- **[Setup](setup.md)** — one-time bootstrap: migrations to run, how to mark the first admin, how to test the feature end-to-end.
- **[Billing](billing.md)** — billing hub: prior-period model, cadence/cycle fields, rollover, minimum-availability (catch-up) rule, line items, balance fields, recurring items, agreement transitions.
- **[Cadence billing & regeneration](cadence-billing.md)** — invoice period (`period_*` vs `cycle_*`), one-cycle offset, numbering, regeneration rules + legacy `period == cycle` migration, interim overage invoices.
- **[Milestone billing](milestone-billing.md)** — flat-fee deliverable billing via `milestone_price`.
- **[Payments](payments.md)** — payment methods, validation, status transitions, and the payments UI.
- **[CLI](cli.md)** — admin Artisan commands for invoice listing, manual payments, and time-entry creation.
- **[Stripe billing](stripe-billing.md)** — online invoice payments, saved payment methods, payment cap, and webhook behavior.
- **[Deferred billing](deferred-billing.md)** — (new) per-entry flag that lets admins complete work now and bill for it only when retainer capacity exists.
- **[Overpayment credits](overpayment-credits.md)** — (new) any overpaid amount carries forward as a credit on the next invoice(s) and never expires.
- **[Data exports](../exports.md)** — inventory of every download/clipboard surface across the app, including client portal file downloads and invoice print views.

## Code locations

**Backend** (`app/`):

- Models: `app/Models/ClientManagement/`
- Controllers: `app/Http/Controllers/ClientManagement/`
- Services: `app/Services/ClientManagement/` (invoicing, cadence cycles, transitions, recurring items, rollover, allocation, deferred billing, overpayment credits)
- DTOs: `app/Services/ClientManagement/DataTransferObjects/`
- Enums: `app/Enums/ClientManagement/` (invoice kinds, line types, billing/charge cadences, proration policies)

**Frontend** (`resources/js/client-management/`):

- Entry points: `admin.tsx`, `portal.tsx`
- Components: `components/` (admin) and `components/portal/` (client portal)
- Types + Zod schemas: `types/`
- Jest tests: `__tests__/`, plus co-located `components/**/__tests__/` and `types/__tests__/`

**Views**: `resources/views/client-management/` (admin + `portal/` subfolder).

**Tests**: `tests/Feature/ClientManagement/`, `tests/Unit/ClientManagement/`.

## High-level flow

1. Admin creates a **client company**, invites users, and signs an **agreement** (retainer, hourly rate, billing cadence, rollover months, catch-up threshold).
2. Team members log **time entries** against company projects/tasks through the portal. Entries may be flagged `is_deferred_billing` to defer billing until capacity exists.
3. Admin configures optional **recurring items** on the agreement for fixed-fee monthly, quarterly, semi-annual, annual, or one-time charges.
4. Admin "Generates Invoices" → **draft** invoices are created for each monthly, quarterly, or annual cadence cycle. Drafts auto-regenerate when time entries change. Issued/Paid/Void invoices are immutable.
5. For non-monthly agreements with `bill_overage_interim = true`, interim overage invoices can be emitted at completed month boundaries inside the current cadence cycle.
6. Payments are recorded against invoices. Overpayments automatically become **credits** applied to the next draft invoice.
7. On **agreement transition**, the outgoing agreement is terminated, a successor agreement is created, rollover can be carried forward, and activity log rows record the change.
8. On **agreement termination**, outstanding deferred entries are force-billed at the hourly rate on the final invoice.

## Conventions

- Dates: all models use the `SerializesDatesAsLocal` trait (see `AGENTS.md`).
- Monetary math: frontend uses `currency.js`; backend uses decimal casts.
- Authorization: Admin gate on admin routes; `ClientCompanyMember` gate on portal routes. Both defined in `AppServiceProvider`.
- Testing: PHPUnit (SQLite in-memory) for backend, Jest for frontend. See [TESTING.md](../../TESTING.md).
