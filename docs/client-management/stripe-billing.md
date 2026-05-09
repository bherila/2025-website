# Stripe Billing

Client invoices can be paid online through Stripe when the invoice is issued, has a remaining balance, and the invoice total is at or below the configured cap.

## Configuration

Set these environment values before enabling online payments:

```env
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_FINANCIAL_CONNECTIONS_ENABLED=false
```

The online payment cap is configured in `config/client-management.php` at `stripe.max_amount_cents`. The default is `100000` ($1,000). Invoices above that amount stay manual-only.

## Client Portal

- `/client/portal/{slug}/billing` shows saved payment methods for the client company.
- Issued invoice pages show a payment panel for online-eligible invoices.
- Clients can pay with a saved method, a new card, a US bank account, or choose manual instructions.
- Saved methods are scoped to a client company and can be removed or marked default.

## Source Of Truth

`client_invoice_payments` remains the invoice payment ledger. Stripe-specific tables store customer IDs, saved method metadata, PaymentIntent activity, and webhook idempotency records. Webhooks create, restore, or soft-delete `ClientInvoicePayment` rows as Stripe state changes.

## Webhooks

Stripe should send events to:

```text
POST /api/webhooks/stripe
```

Handled events include PaymentIntent success, processing, failure, cancellation, disputes, refunds, saved method attach/detach, and SetupIntent success. Duplicate events are ignored using `client_invoice_stripe_events.stripe_event_id`.
