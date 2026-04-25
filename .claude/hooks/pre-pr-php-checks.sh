#!/usr/bin/env bash
# Runs PHPStan + PHPUnit before gh pr create/merge if PHP files are changed.
set -euo pipefail

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')

# Only trigger for gh pr create or gh pr merge
if ! echo "$command" | grep -qE 'gh pr (create|merge)'; then
    exit 0
fi

# Check if any PHP files differ from main
php_changes=$(git diff --name-only origin/main...HEAD -- '*.php' 2>/dev/null || git diff --name-only HEAD~1 -- '*.php' 2>/dev/null || true)

if [ -z "$php_changes" ]; then
    exit 0
fi

echo "PHP files changed — running PHPStan and PHPUnit before PR..." >&2

# PHPStan
if ! vendor/bin/phpstan analyse --no-progress 2>&1; then
    echo '{"continue": false, "stopReason": "PHPStan errors found. Fix them before creating/merging the PR."}'
    exit 0
fi

# PHPUnit
if ! php artisan test --compact 2>&1; then
    echo '{"continue": false, "stopReason": "PHPUnit tests failed. Fix them before creating/merging the PR."}'
    exit 0
fi

echo "PHPStan and PHPUnit passed." >&2
exit 0
