#!/usr/bin/env bash
# Reconcile dependencies and seed .env in the current worktree.
# Safe to run in the primary checkout or any worktree. Idempotent.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
PRIMARY_GIT_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
PRIMARY_ROOT="$(cd "$(dirname "$PRIMARY_GIT_DIR")" && pwd)"
REPO_NAME="$(basename "$PRIMARY_ROOT")"
CACHE_ROOT="${WORKTREE_CACHE_ROOT:-$HOME/dev/worktree-cache/$REPO_NAME}"

mkdir -p "$CACHE_ROOT/pnpm-store" "$CACHE_ROOT/composer-cache"

cd "$REPO_ROOT"

if [[ "$REPO_ROOT" != "$PRIMARY_ROOT" && ! -f "$REPO_ROOT/.env" && -f "$PRIMARY_ROOT/.env" ]]; then
  cp "$PRIMARY_ROOT/.env" "$REPO_ROOT/.env"
  chmod 600 "$REPO_ROOT/.env"
  echo "[wt] Seeded .env from $PRIMARY_ROOT" >&2
fi

if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
  echo "[wt] pnpm install --frozen-lockfile --prefer-offline" >&2
  pnpm install --frozen-lockfile --prefer-offline
elif [[ -f package-lock.json ]] && command -v npm >/dev/null 2>&1; then
  echo "[wt] npm install --prefer-offline" >&2
  npm install --prefer-offline
fi

if [[ -f composer.lock ]] && command -v composer >/dev/null 2>&1; then
  export COMPOSER_CACHE_DIR="$CACHE_ROOT/composer-cache"
  echo "[wt] composer install --no-interaction --prefer-dist" >&2
  composer install --no-interaction --prefer-dist
fi

echo "[wt] Bootstrap complete: $REPO_ROOT" >&2
