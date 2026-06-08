#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '\n==> %s\n' "$*"
}

cleanup_paths=()

cleanup() {
  local path

  for path in "${cleanup_paths[@]}"; do
    rm -f "$path"
  done
}

trap cleanup EXIT

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

run_as_root() {
  if [[ "$(id -u)" == "0" ]]; then
    "$@"
  else
    need_cmd sudo
    sudo "$@"
  fi
}

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

export CI="${CI:-1}"
export PATH="$HOME/.local/bin:$PATH"

cd "$REPO_ROOT"

need_cmd curl
need_cmd php
need_cmd node

install_apt_package() {
  local package="$1"

  need_cmd apt-get

  log "Installing $package via apt"

  run_as_root apt-get update
  run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$package"
}

ensure_qpdf() {
  if command -v qpdf >/dev/null 2>&1; then
    log "qpdf already installed: $(qpdf --version | head -n 1)"
    return 0
  fi

  install_apt_package qpdf
}

ensure_composer() {
  if command -v composer >/dev/null 2>&1; then
    log "Composer already installed: $(composer --version)"
    return 0
  fi

  log "Installing Composer"

  mkdir -p "$HOME/.local/bin"

  local installer
  installer="$(mktemp)"
  cleanup_paths+=("$installer")

  local expected_checksum
  local actual_checksum
  expected_checksum="$(curl -fsSL https://composer.github.io/installer.sig)"
  curl -fsSL https://getcomposer.org/installer -o "$installer"
  actual_checksum="$(php -r "echo hash_file('sha384', '$installer');")"

  if [[ "$expected_checksum" != "$actual_checksum" ]]; then
    echo "ERROR: Invalid Composer installer checksum." >&2
    exit 1
  fi

  php "$installer" \
    --install-dir="$HOME/.local/bin" \
    --filename=composer \
    --quiet

  rm -f "$installer"
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    log "pnpm already installed: $(pnpm --version)"
    return 0
  fi

  log "Installing pnpm via Corepack"

  need_cmd corepack
  mkdir -p "$HOME/.local/bin"
  corepack enable --install-directory "$HOME/.local/bin"

  local package_manager
  package_manager="$(
    node - <<'NODE'
try {
  const { packageManager } = require("./package.json");
  if (packageManager && packageManager.startsWith("pnpm@")) {
    process.stdout.write(packageManager);
  }
} catch {}
NODE
  )"

  if [[ -z "$package_manager" ]]; then
    echo "ERROR: package.json must define packageManager as pnpm@<version>." >&2
    exit 1
  fi

  corepack prepare "$package_manager" --activate
  pnpm --version
}

configure_github_npm_auth() {
  if [[ -z "${GITHUB_TOKEN:-}" ]]; then
    return 0
  fi

  local existing_userconfig="${NPM_CONFIG_USERCONFIG:-}"
  local npmrc
  npmrc="$(mktemp)"
  cleanup_paths+=("$npmrc")

  if [[ -n "$existing_userconfig" && -f "$existing_userconfig" ]]; then
    cat "$existing_userconfig" > "$npmrc"
  fi

  {
    printf '//github.com/:_authToken=%s\n' "$GITHUB_TOKEN"
    printf '//github.com/:always-auth=true\n'
  } >> "$npmrc"

  export NPM_CONFIG_USERCONFIG="$npmrc"
}

install_node_dependencies() {
  if [[ ! -f package.json ]]; then
    return 0
  fi

  log "Installing Node dependencies"

  if [[ -f pnpm-lock.yaml ]]; then
    pnpm install --frozen-lockfile --prefer-offline
  else
    pnpm install --prefer-offline
  fi
}

install_php_dependencies() {
  if [[ ! -f composer.json ]]; then
    return 0
  fi

  log "Installing PHP dependencies"

  if [[ -n "${GITHUB_TOKEN:-}" && -z "${COMPOSER_AUTH:-}" ]]; then
    export COMPOSER_AUTH
    COMPOSER_AUTH="$(php -r 'echo json_encode(["github-oauth" => ["github.com" => getenv("GITHUB_TOKEN")]], JSON_UNESCAPED_SLASHES);')"
  fi

  local composer_args=(
    install
    --no-interaction
    --prefer-dist
    --no-progress
  )

  if [[ "${CODEX_COMPOSER_OPTIMIZE_AUTOLOADER:-0}" == "1" ]]; then
    composer_args+=(--optimize-autoloader)
  fi

  composer "${composer_args[@]}"
}

ensure_qpdf
ensure_pnpm
ensure_composer
configure_github_npm_auth
install_node_dependencies
install_php_dependencies

log "Codex environment setup complete"
