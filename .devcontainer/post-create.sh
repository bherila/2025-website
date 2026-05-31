#!/usr/bin/env bash
set -euo pipefail

repo_dir="${CODESPACE_VSCODE_FOLDER:-/workspaces/2025-website}"
cd "$repo_dir"

echo "==> PATH setup"
mkdir -p "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$HOME/bin:$HOME/.codex/bin:$PATH"

path_line='export PATH="$HOME/.local/bin:$HOME/bin:$HOME/.codex/bin:$PATH"'
grep -qxF "$path_line" "$HOME/.bashrc" 2>/dev/null || echo "$path_line" >> "$HOME/.bashrc"
grep -qxF "$path_line" "$HOME/.zshrc" 2>/dev/null || echo "$path_line" >> "$HOME/.zshrc"

echo "==> Codex CLI"
if ! command -v codex >/dev/null 2>&1; then
  curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh
fi

if ! command -v codex >/dev/null 2>&1; then
  codex_bin="$(find "$HOME" -maxdepth 6 -type f -name codex -perm -111 2>/dev/null | head -n 1 || true)"
  if [ -n "${codex_bin:-}" ]; then
    ln -sf "$codex_bin" "$HOME/.local/bin/codex"
  fi
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: Codex CLI install completed but codex is not on PATH" >&2
  exit 1
fi

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
corepack prepare pnpm@11.5.0 --activate || true
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
codex --version

cat <<'MSG'

Done.

Useful commands:
  codex
  composer test
  pnpm run build
  composer run dev

Partner repos are cloned as siblings:
  /workspaces/auth
  /workspaces/ui
  /workspaces/genai-laravel
MSG
