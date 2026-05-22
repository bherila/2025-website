#!/usr/bin/env bash
# Create a new git worktree, CoW-clone large dep dirs from the primary checkout,
# seed .env, run dependency reconciliation, and print the absolute worktree path
# on stdout (so Claude Code's WorktreeCreate hook can consume it).
#
# Usage: scripts/wt/create.sh <name> [base-ref]
set -euo pipefail

NAME="${1:?usage: scripts/wt/create.sh <name> [base-ref]}"
BASE_REF="${2:-HEAD}"

PRIMARY_GIT_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
PRIMARY_ROOT="$(cd "$(dirname "$PRIMARY_GIT_DIR")" && pwd)"
REPO_NAME="$(basename "$PRIMARY_ROOT")"
WT_ROOT="${WORKTREE_ROOT:-$HOME/dev/worktrees/$REPO_NAME}"

mkdir -p "$WT_ROOT"

SAFE_NAME="$(printf '%s' "$NAME" | tr -cs 'A-Za-z0-9._/-' '-' | sed 's:^-*::; s:-*$::')"
WT_PATH="$WT_ROOT/$SAFE_NAME"

if [[ -e "$WT_PATH" ]]; then
  echo "$WT_PATH"
  exit 0
fi

git -C "$PRIMARY_ROOT" worktree add --detach "$WT_PATH" "$BASE_REF" >&2

# CoW-clone (APFS clone / reflink) a large directory from primary into the new
# worktree. Falls back to rsync. Skips silently when src is missing or dst exists.
cow_copy_dir() {
  local src="$1" dst="$2"
  [[ -d "$src" ]] || return 0
  [[ ! -e "$dst" ]] || return 0
  mkdir -p "$(dirname "$dst")"

  # Linux: reflinks on btrfs/XFS.
  if cp -a --reflink=always "$src" "$dst" 2>/dev/null; then
    echo "[wt] reflink-cloned $src" >&2
    return 0
  fi

  # macOS APFS: -c is clonefile().
  if cp -cR "$src" "$dst" 2>/dev/null; then
    echo "[wt] APFS-cloned $src" >&2
    return 0
  fi

  echo "[wt] rsync fallback for $src" >&2
  rsync -a "$src/" "$dst/"
}

# vendor/ is large and immutable enough that a CoW clone + composer install
# reconcile is much faster than a cold install. node_modules is left to pnpm
# (its global virtual store + frozen-lockfile install is faster than cloning).
cow_copy_dir "$PRIMARY_ROOT/vendor" "$WT_PATH/vendor"

(
  cd "$WT_PATH"
  "$PRIMARY_ROOT/scripts/wt/bootstrap.sh" >&2
)

# IMPORTANT: stdout must contain exactly the worktree path so Claude Code's
# WorktreeCreate hook can pick it up.
echo "$WT_PATH"
