# Codex Cloud Setup

Use these checked-in scripts for the Codex Cloud environment configuration.

Setup script:

```bash
bash codex/setup.sh
```

Maintenance setup script:

```bash
bash codex/maintenance.sh
```

`setup.sh` assumes the Codex image already provides Node 22 and PHP 8.5. It uses
tools already available on `PATH` when possible and only runs the qpdf apt
install, Composer installer, or Corepack pnpm activation when the corresponding
binary is missing. It then installs Node/PHP dependencies from the committed
lockfiles.
`maintenance.sh` reuses the same setup path with Composer optimized autoloading
enabled for the cached environment.

## Environment Variables

Required Codex secret:

- `GITHUB_TOKEN` - used for GitHub access and GitHub-hosted dependencies. The
  setup script passes it to pnpm through a temporary process-local npm config
  and to Composer through process-local `COMPOSER_AUTH` when needed, but
  deliberately does not write it into persistent auth files so cached setup
  output does not persist secrets.

Required app/integration secrets for baseline setup:

- None.

Tasks that need external services will need the relevant secrets added before they
can run against those services:

- GenAI: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, or Bedrock/AWS credentials.
- Sentry: `SENTRY_LARAVEL_DSN`, `VITE_SENTRY_DSN`.
- Stripe: `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Mail/S3/R2 credentials when an agent is working on those features.

## System Binaries

Baseline Codex setup expects the image to provide `bash`, `curl`, PHP 8.5,
Node 22, `apt-get`, and either `pnpm` or `corepack`. If `qpdf` is not already
available on `PATH`, the setup script installs it with:

```bash
apt-get install -y --no-install-recommends qpdf
```

`qpdf` is available proactively so Codex tasks that need to regenerate committed
IRS PDF background assets can do so without changing the environment first.
