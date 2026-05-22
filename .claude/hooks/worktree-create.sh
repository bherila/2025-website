#!/usr/bin/env bash
# Claude Code WorktreeCreate hook. Receives a JSON payload on stdin and MUST
# print the absolute worktree path on stdout.
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

PAYLOAD="$(cat || true)"

NAME=""
if command -v jq >/dev/null 2>&1 && [[ -n "$PAYLOAD" ]]; then
  NAME="$(printf '%s' "$PAYLOAD" | jq -r '
    .subagent_name // .agent_type // .agent_id // .name // empty
  ' 2>/dev/null || true)"
fi
NAME="${NAME:-claude-$(date +%Y%m%d-%H%M%S)}"

exec "$ROOT/scripts/wt/create.sh" "$NAME"
