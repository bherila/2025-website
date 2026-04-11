#!/usr/bin/env python3
"""
Check that all auto-generated and explicit MySQL identifiers in migration files
stay within MySQL's 64-character limit (we enforce 63 to leave a safety margin).

Auto-generated names follow Laravel's convention:
  {table}_{column}_{type}  e.g. fin_account_line_items_t_account_index

Explicit names are set via ->name('...') on index/foreign/unique blueprints.

Exit code 0 = all clean, 1 = one or more violations found.
"""

import os
import re
import sys

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'database', 'migrations')
MAX_LEN = 63


def check_migrations(migrations_dir: str) -> list[str]:
    issues: list[str] = []

    for fname in sorted(os.listdir(migrations_dir)):
        if not fname.endswith('.php'):
            continue

        path = os.path.join(migrations_dir, fname)
        content = open(path).read()

        # 1. Explicit ->name('identifier') or ->name("identifier")
        for m in re.finditer(r"->name\(['\"]([^'\"]+)['\"]\)", content):
            name = m.group(1)
            if len(name) > MAX_LEN:
                issues.append(
                    f"EXPLICIT ({len(name)} chars > {MAX_LEN}): '{name}'\n"
                    f"  in {fname}"
                )

        # 2. Auto-generated names: {table}_{column}_{suffix}
        # Collect all table names referenced in this migration file
        tables = re.findall(
            r"Schema::(?:create|table)\(['\"]([^'\"]+)['\"]", content
        )

        # Columns used with index / unique (may be array or single)
        # ->index(['col1', 'col2']) or ->index('col')
        # For single-column cases we can form the auto name; skip multi-column arrays
        # (Laravel joins them with underscores for arrays, but those are rare enough
        # that an explicit ->name() should be used there anyway)
        cols_index = re.findall(
            r"\$table->(?:index|unique)\(['\"]([^'\"]+)['\"]", content
        )
        cols_foreign = re.findall(
            r"\$table->foreign\(['\"]([^'\"]+)['\"]", content
        )

        for table in tables:
            for col in cols_index:
                for suffix in ('_index', '_unique'):
                    auto = f"{table}_{col}{suffix}"
                    if len(auto) > MAX_LEN:
                        issues.append(
                            f"AUTO-GEN ({len(auto)} chars > {MAX_LEN}): '{auto}'\n"
                            f"  table='{table}' col='{col}' in {fname}\n"
                            f"  Fix: add ->name('<shorter_name>') to the index call."
                        )
            for col in cols_foreign:
                auto = f"{table}_{col}_foreign"
                if len(auto) > MAX_LEN:
                    issues.append(
                        f"AUTO-GEN ({len(auto)} chars > {MAX_LEN}): '{auto}'\n"
                        f"  table='{table}' col='{col}' in {fname}\n"
                        f"  Fix: add ->name('<shorter_name>') to the foreign() call."
                    )

    return issues


def main() -> int:
    issues = check_migrations(MIGRATIONS_DIR)

    if issues:
        print(f"MySQL identifier length violations (limit: {MAX_LEN} chars):\n")
        for issue in issues:
            print(f"  ✗ {issue}\n")
        print(f"{len(issues)} violation(s) found.")
        return 1

    print(f"✓ All migration identifiers are within {MAX_LEN} characters.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
