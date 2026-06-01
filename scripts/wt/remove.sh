#!/usr/bin/env bash
# Safely remove a worktree. Refuses to remove a worktree with uncommitted changes
# unless --force is passed.
#
# Usage: scripts/wt/remove.sh <worktree-path> [--force]
set -euo pipefail

WT_PATH="${1:?usage: scripts/wt/remove.sh <worktree-path> [--force]}"
FORCE="${2:-}"

if [[ ! -d "$WT_PATH" ]]; then
  exit 0
fi

PRIMARY_GIT_DIR="$(git -C "$WT_PATH" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
if [[ -z "$PRIMARY_GIT_DIR" ]]; then
  echo "[wt] not a git worktree: $WT_PATH" >&2
  exit 1
fi
PRIMARY_ROOT="$(cd "$(dirname "$PRIMARY_GIT_DIR")" && pwd)"
WT_ABS="$(cd "$WT_PATH" && pwd)"

if [[ "$FORCE" != "--force" ]]; then
  DIRTY="$(git -C "$WT_ABS" status --porcelain 2>/dev/null || true)"
  if [[ -n "$DIRTY" ]]; then
    echo "[wt] refusing to remove dirty worktree: $WT_ABS" >&2
    echo "$DIRTY" >&2
    echo "[wt] pass --force to remove anyway" >&2
    exit 1
  fi

  HEAD_SHA="$(git -C "$WT_ABS" rev-parse --verify HEAD 2>/dev/null || true)"
  if [[ -n "$HEAD_SHA" ]]; then
    REACHABLE_REFS="$(git -C "$PRIMARY_ROOT" for-each-ref --contains "$HEAD_SHA" --format='%(refname)' 2>/dev/null || true)"
    if [[ -z "$REACHABLE_REFS" ]]; then
      echo "[wt] refusing to remove worktree with committed changes not reachable from any ref: $WT_ABS" >&2
      echo "[wt] HEAD $HEAD_SHA is not contained in a local branch, remote-tracking branch, or tag" >&2
      echo "[wt] create a branch/tag, push it, or pass --force to remove anyway" >&2
      exit 1
    fi
  fi
fi

if [[ "$FORCE" == "--force" ]]; then
  git -C "$PRIMARY_ROOT" worktree remove --force "$WT_ABS" >&2
else
  git -C "$PRIMARY_ROOT" worktree remove "$WT_ABS" >&2
fi

git -C "$PRIMARY_ROOT" worktree prune >&2 || true
