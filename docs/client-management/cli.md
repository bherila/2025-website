# Client Management CLI

These Artisan commands are admin-only operational helpers. They default to user id `1`; pass `--user=<id>` only when another admin should be the actor.

Use built-in help for the current option list:

```bash
php artisan list client-management
php artisan help client-management:invoices
php artisan help client-management:apply-payment
php artisan help client-management:create-time-entry
```

## List Invoices

```bash
php artisan client-management:invoices
php artisan client-management:invoices --client=acme-inc
php artisan client-management:invoices --status=issued --status=paid
php artisan client-management:invoices --client=acme-inc --status=draft,issued --format=json
```

The table includes invoice totals, payment totals, remaining balances, and hour-balance columns. Omit `--client` to list across all clients.

## Apply Payment

```bash
php artisan client-management:apply-payment INV-202605-001 250.00 2026-05-14
php artisan client-management:apply-payment 123 250.00 2026-05-14 --type=wire --notes="Wire confirmation 1042"
```

Payments can be applied only to issued invoices. `--type` defaults to `ach` and accepts `ach`, `credit-card`, `wire`, `check`, or `other`. A full or over payment marks the invoice paid, matching the admin API behavior.

## Create Time Entry

```bash
php artisan client-management:create-time-entry acme-inc "Build payment export" 1:30 2026-05-14
php artisan client-management:create-time-entry acme-inc "Discovery call" 0.75 2026-05-14 --project=platform --billable=0 --category="Project Management"
php artisan client-management:create-time-entry acme-inc "Deferred implementation" 2.25 2026-05-14 --defer=1
```

If `--project` is omitted, the command uses the client's only project. When a client has zero or multiple projects, pass `--project=<id|slug|exact name>`. Defaults are billable `true`, deferred billing `false`, and category `Software Development`.
