#!/usr/bin/env bash
# PostToolUse hook: auto-fix TS/TSX with ESLint and check PHP with PHPStan.
# Reads Claude Code tool-use JSON from stdin.
# PHPStan result cache is configured in phpstan.neon (resultCachePath: .phpstan-cache/).
set -euo pipefail

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")

if [[ "$FILE" =~ \.(ts|tsx)$ ]]; then
  pnpm lint:fix
elif [[ "$FILE" =~ \.php$ ]]; then
  vendor/bin/phpstan analyse --no-progress "$FILE"
fi
