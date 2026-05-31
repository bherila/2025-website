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
WT_ROOT_ABS="$(cd "$WT_ROOT" && pwd)"

# Drop path separators and any chars that aren't safe identifiers, then strip
# leading dots/dashes so the result can't be "." / ".." / "-..." - without this
# guard a name like "../foo" survives sanitization (it contains only allowed
# chars under the old allowlist) and escapes WT_ROOT.
SAFE_NAME="$(printf '%s' "$NAME" | tr -cs 'A-Za-z0-9._-' '-' | sed 's:^[.-]*::; s:-*$::')"
if [[ -z "$SAFE_NAME" || "$SAFE_NAME" == "." || "$SAFE_NAME" == ".." ]]; then
  echo "[wt] invalid worktree name: '$NAME'" >&2
  exit 1
fi

WT_PATH="$WT_ROOT_ABS/$SAFE_NAME"

# Defense in depth: confirm the resolved path lives under WT_ROOT_ABS.
case "$WT_PATH" in
  "$WT_ROOT_ABS"/*) : ;;
  *) echo "[wt] worktree path escapes WT_ROOT: $WT_PATH" >&2; exit 1 ;;
esac

if [[ -e "$WT_PATH" ]]; then
  # Only reuse if it's a real registered git worktree - a stale plain directory
  # from a prior failed run shouldn't masquerade as success.
  # Match the whole `worktree <path>` line literally - porcelain separates label
  # and value with a single space, so awk's $2 would truncate paths that
  # legitimately contain spaces (e.g. WORKTREE_ROOT="/tmp/my trees").
  if git -C "$PRIMARY_ROOT" worktree list --porcelain 2>/dev/null \
       | grep -Fxq "worktree $WT_PATH"; then
    echo "[wt] reusing existing worktree: $WT_PATH" >&2
    echo "$WT_PATH"
    exit 0
  fi
  echo "[wt] $WT_PATH exists but is not a registered git worktree; refusing to reuse" >&2
  echo "[wt] remove it manually or pick a different name" >&2
  exit 1
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

# vendor/ is large and immutable enough that a CoW clone plus composer install
# reconcile is much faster than a cold install. node_modules is left to pnpm
# because its global virtual store and frozen-lockfile install are fast.
cow_copy_dir "$PRIMARY_ROOT/vendor" "$WT_PATH/vendor"

(
  cd "$WT_PATH"
  "$PRIMARY_ROOT/scripts/wt/bootstrap.sh" >&2
)

# IMPORTANT: stdout must contain exactly the worktree path so Claude Code's
# WorktreeCreate hook can pick it up.
echo "$WT_PATH"
