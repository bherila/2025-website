#!/usr/bin/env bash
set -euo pipefail

repo_dir="${CODESPACE_VSCODE_FOLDER:-/workspaces/2025-website}"
cd "$repo_dir"

echo "==> GitHub / Composer auth"
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh_token="$(gh auth token 2>/dev/null || true)"
  if [ -n "${gh_token:-}" ]; then
    composer config --global github-oauth.github.com "$gh_token" >/dev/null 2>&1 || true
  fi
fi

echo "==> Partner repos"
clone_or_fetch() {
  local slug="$1"
  local dir="/workspaces/${slug#bherila/}"

  if [ -d "$dir/.git" ]; then
    git -C "$dir" fetch --all --prune || true
    return
  fi

  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    gh repo clone "$slug" "$dir" || git clone "https://github.com/${slug}.git" "$dir"
  else
    git clone "https://github.com/${slug}.git" "$dir"
  fi
}

clone_or_fetch bherila/auth
clone_or_fetch bherila/ui
clone_or_fetch bherila/genai-laravel

echo "==> Node / pnpm"
corepack enable || true
corepack prepare pnpm@10 --activate || true
pnpm install --frozen-lockfile --prefer-offline

echo "==> PHP / Composer"
php -m | grep -qi '^gd$' || { echo "ERROR: PHP gd extension is missing"; exit 1; }
php -m | grep -qi '^intl$' || { echo "ERROR: PHP intl extension is missing"; exit 1; }
php -m | grep -qi '^zip$' || { echo "ERROR: PHP zip extension is missing"; exit 1; }

XDEBUG_MODE=off composer install --no-interaction --prefer-dist

echo "==> Laravel env"
if [ ! -f .env ]; then
  cp .env.example .env
fi

if ! grep -Eq '^APP_KEY=base64:.+' .env; then
  XDEBUG_MODE=off php artisan key:generate --ansi --force
fi

echo "==> Versions"
php -v | head -n 1
composer --version
pnpm --version

cat <<'MSG'

Done.

Useful commands:
  composer test
  pnpm run build
  composer run dev

Partner repos are cloned as siblings:
  /workspaces/auth
  /workspaces/ui
  /workspaces/genai-laravel
MSG
