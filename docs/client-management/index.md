# Client Management

Admin-only feature for managing client companies, their users, agreements, time tracking, expenses, milestones, and invoicing. Includes both an admin UI and a client-facing portal.

## Quick links

- **[Overview](overview.md)** — architecture, schema, models, controllers, routes, and workflows.
- **[Setup](setup.md)** — one-time bootstrap: migrations to run, how to mark the first admin, how to test the feature end-to-end.
- **[Billing](billing.md)** — retainer / rollover logic, invoice lifecycle, payments, milestones, catch-up rule.
- **[Deferred billing](deferred-billing.md)** — (new) per-entry flag that lets admins complete work now and bill for it only when retainer capacity exists.
- **[Overpayment credits](overpayment-credits.md)** — (new) any overpaid amount carries forward as a credit on the next invoice(s) and never expires.

## Code locations

**Backend** (`app/`):

- Models: `app/Models/ClientManagement/`
- Controllers: `app/Http/Controllers/ClientManagement/`
- Services: `app/Services/ClientManagement/` (invoicing, rollover, allocation, deferred billing, overpayment credits)
- DTOs: `app/Services/ClientManagement/DataTransferObjects/`
- Enum: `app/Enums/ClientManagement/InvoiceLineType.php`

**Frontend** (`resources/js/client-management/`):

- Entry points: `admin.tsx`, `portal.tsx`
- Components: `components/` (admin) and `components/portal/` (client portal)
- Types + Zod schemas: `types/`
- Jest tests: `__tests__/`, plus co-located `components/**/__tests__/` and `types/__tests__/`

**Views**: `resources/views/client-management/` (admin + `portal/` subfolder).

**Tests**: `tests/Feature/ClientManagement/`, `tests/Unit/ClientManagement/`.

## High-level flow

1. Admin creates a **client company**, invites users, and signs an **agreement** (retainer, hourly rate, rollover months, catch-up threshold).
2. Team members log **time entries** against company projects/tasks through the portal. Entries may be flagged `is_deferred_billing` to defer billing until capacity exists.
3. Admin "Generates Invoices" → a **draft** invoice is created for each month. Drafts auto-regenerate when time entries change. Issued/Paid/Void invoices are immutable.
4. Payments are recorded against invoices. Overpayments automatically become **credits** applied to the next draft invoice.
5. On **agreement termination**, outstanding deferred entries are force-billed at the hourly rate on the final invoice.

## Conventions

- Dates: all models use the `SerializesDatesAsLocal` trait (see `AGENTS.md`).
- Monetary math: frontend uses `currency.js`; backend uses decimal casts.
- Authorization: Admin gate on admin routes; `ClientCompanyMember` gate on portal routes. Both defined in `AppServiceProvider`.
- Testing: PHPUnit (SQLite in-memory) for backend, Jest for frontend. See [TESTING.md](../../TESTING.md).
