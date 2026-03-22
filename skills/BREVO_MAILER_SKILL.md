# Brevo Mailer Skill for Laravel 12

This skill enables **Brevo (formerly Sendinblue)** as a first‑class mail transport in **Laravel 12**, using the official Symfony Brevo Mailer bridge. It standardizes the configuration so you can enable `MAIL_MAILER=brevo` across multiple projects.

---

## Installation

You must install both the Brevo mailer bridge and the Symfony HTTP client (required for API transport):

```bash
composer require symfony/brevo-mailer symfony/http-client
```

---

## Service Provider Setup

Add the Brevo transport to your `AppServiceProvider.php`.

```php
use Symfony\Component\Mailer\Transport\Dsn;
use Symfony\Component\Mailer\Bridge\Brevo\Transport\BrevoTransportFactory;

public function boot(): void
{
    $this->app['mail.manager']->extend('brevo', function ($config) {
        $configuration = $this->app->make('config');

        return (new BrevoTransportFactory())->create(
            Dsn::fromString($configuration->get('services.brevo.dsn'))
        );
    });
}
```

This registers a `brevo` transport that Laravel can use like any built‑in mailer.

---

## Configuration

### `config/services.php`

```php
'brevo' => [
    'dsn' => env('MAILER_DSN'),
],
```

### `config/mail.php`

```php
'default' => env('MAIL_MAILER', 'brevo'),

'mailers' => [
    'brevo' => [
        'transport' => 'brevo',
    ],
],
```

---

## Environment Variables

### API Transport (Brevo v3 API Key)

```
MAIL_MAILER=brevo
MAILER_DSN=brevo+api://xkeysib-YOUR_V3_API_KEY@default
```

### SMTP Transport (optional)

```
MAIL_MAILER=brevo
MAILER_DSN=brevo+smtp://SMTP_LOGIN:SMTP_PASSWORD@default
```

---

## Testing & Troubleshooting

### Verify via Tinker

Run this command to test transport registration and API connectivity:

```bash
php artisan tinker --execute="Mail::raw('Test', fn($m) => $m->to('your@email.com')->subject('Brevo Test'));"
```

### Common Errors

- **401 Unauthorized (“Key not found”)** — API key is invalid or truncated. Ensure it begins with `xkeysib-`. If using SMTP credentials, switch to the `brevo+smtp://` DSN.
- **Missing HttpClient** — Install `symfony/http-client` if you see errors related to `AbstractHttpTransport`.
- **405 Method Not Allowed** — Usually indicates an incorrect endpoint or a version mismatch between the Brevo bridge and your Symfony/Laravel version.

---

If you want to expand this into a reusable package instead of a copy‑paste skill, I can help outline the structure for that.
