#!/usr/bin/env bash
# Claude Code WorktreeRemove hook. Receives a JSON payload on stdin describing
# the worktree being removed. Failures are logged at debug level only.
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

PAYLOAD="$(cat || true)"

WT_PATH=""
if command -v jq >/dev/null 2>&1 && [[ -n "$PAYLOAD" ]]; then
  WT_PATH="$(printf '%s' "$PAYLOAD" | jq -r '
    .worktree_path // .worktreePath // .cwd // empty
  ' 2>/dev/null || true)"
fi

[[ -n "$WT_PATH" ]] || exit 0

exec "$ROOT/scripts/wt/remove.sh" "$WT_PATH"
