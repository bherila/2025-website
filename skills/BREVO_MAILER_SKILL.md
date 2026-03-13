# Brevo Mailer Skill for Laravel 12

This skill enables **Brevo (formerly Sendinblue)** as a first‑class mail transport in **Laravel 12**, using the official Symfony Brevo Mailer bridge. It provides a consistent setup you can reuse across multiple projects.

---

## Overview

Laravel 12 uses **Symfony Mailer** under the hood, which allows registering **custom Symfony transports**. The package `symfony/brevo-mailer` provides an official Brevo transport that integrates cleanly with Laravel once registered.

This skill adds:

- A custom `brevo` mail transport  
- A reusable DSN configuration  
- A standard `.env` pattern  
- A consistent mailer entry for all your Laravel projects  

---

## Installation

```bash
composer require symfony/brevo-mailer
```

---

## Service Provider Setup

Add the Brevo transport to your `AppServiceProvider`.

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

Add a mailer entry:

```php
'mailers' => [
    'brevo' => [
        'transport' => 'brevo',
    ],
],
```

Set it as the default mailer:

```php
'default' => env('MAIL_MAILER', 'brevo'),
```

---

## Environment Variables

### API Transport (recommended)

```
MAIL_MAILER=brevo
MAILER_DSN=brevo+api://YOUR_BREVO_API_KEY@default
```

### SMTP Transport (optional)

```
MAIL_MAILER=brevo
MAILER_DSN=brevo+smtp://SMTP_LOGIN:SMTP_PASSWORD@default
```

---

## Usage

Once configured, send mail normally:

```php
Mail::to('user@example.com')->send(new WelcomeMail());
```

All Laravel features—Markdown mailables, queueing, attachments—work without modification.

---

## Notes

- The API transport is faster and supports Brevo‑specific metadata.
- This skill is intentionally minimal and reusable across projects.
- For full Brevo API features (contacts, automations, webhooks), use a dedicated Brevo SDK separately.

---

