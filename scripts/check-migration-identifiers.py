#!/usr/bin/env python3
"""
Check that auto-generated and explicit MySQL identifiers in migration files
stay within MySQL's 64-character limit (we enforce 63 to leave a safety margin).

Auto-generated names follow Laravel's convention:
  {table}_{columns}_{type}  e.g. client_agreement_recurring_items_client_agreement_id_start_date_end_date_index

Explicit names are set via the index/unique/foreign name argument, named
arguments such as indexName:, or ->name('...') on foreign blueprints.

Exit code 0 = all clean, 1 = one or more violations found.
"""

import os
import re
import sys

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'database', 'migrations')
MAX_LEN = 63


def matching_brace_offset(content: str, opening_offset: int) -> int:
    depth = 0

    for index in range(opening_offset, len(content)):
        char = content[index]

        if char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                return index

    return len(content)


def schema_blocks(content: str) -> list[tuple[str, str]]:
    blocks: list[tuple[str, str]] = []
    pattern = re.compile(
        r"Schema::(?:create|table)\(['\"]([^'\"]+)['\"]\s*,\s*function\s*\([^)]*\)\s*\{",
        re.DOTALL,
    )

    for match in pattern.finditer(content):
        opening_offset = match.end() - 1
        closing_offset = matching_brace_offset(content, opening_offset)
        blocks.append((match.group(1), content[opening_offset + 1:closing_offset]))

    return blocks


def string_literals(value: str) -> list[str]:
    return [match.group(1) or match.group(2) for match in re.finditer(r"'([^']+)'|\"([^\"]+)\"", value)]


def identifier_constants(content: str) -> dict[str, str]:
    return {
        match.group(1): match.group(2) or match.group(3)
        for match in re.finditer(
            r"\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*(?:'([^']+)'|\"([^\"]+)\")",
            content,
        )
    }


def explicit_identifier_names(value: str, constants: dict[str, str]) -> list[str]:
    names = string_literals(value)

    for match in re.finditer(r"\b(?:self|static)::([A-Z][A-Z0-9_]*)", value):
        if match.group(1) in constants:
            names.append(constants[match.group(1)])

    return names


def normalize_columns(columns: str) -> str | None:
    columns = columns.strip()

    if columns.startswith('['):
        values = string_literals(columns)
        if not values:
            return None

        return '_'.join(values)

    values = string_literals(columns)
    return values[0] if values else None


def add_issue(issues: list[str], kind: str, name: str, fname: str, fix: str) -> None:
    if len(name) > MAX_LEN:
        issues.append(
            f"{kind} ({len(name)} chars > {MAX_LEN}): '{name}'\n"
            f"  in {fname}\n"
            f"  Fix: {fix}"
        )


def check_explicit_name(issues: list[str], name: str, fname: str) -> None:
    add_issue(
        issues,
        'EXPLICIT',
        name,
        fname,
        'choose a shorter explicit identifier name.',
    )


def check_migrations(migrations_dir: str) -> list[str]:
    issues: list[str] = []

    for fname in sorted(os.listdir(migrations_dir)):
        if not fname.endswith('.php'):
            continue

        path = os.path.join(migrations_dir, fname)
        with open(path) as migration_file:
            content = migration_file.read()

        constants = identifier_constants(content)

        # Explicit ->name('identifier'), indexName: 'identifier', etc.
        for m in re.finditer(r"->name\(['\"]([^'\"]+)['\"]\)", content):
            check_explicit_name(issues, m.group(1), fname)

        for m in re.finditer(r"\b(?:indexName|name)\s*:\s*['\"]([^'\"]+)['\"]", content):
            check_explicit_name(issues, m.group(1), fname)

        for m in re.finditer(r"\b(?:indexName|name)\s*:\s*(?:self|static)::([A-Z][A-Z0-9_]*)", content):
            if m.group(1) in constants:
                check_explicit_name(issues, constants[m.group(1)], fname)

        for table, body in schema_blocks(content):
            for m in re.finditer(
                r"\$table->(?P<method>index|unique|foreign)\(\s*"
                r"(?P<columns>\[[^\]]+\]|['\"][^'\"]+['\"])\s*"
                r"(?P<rest>[^)]*)\)",
                body,
                re.DOTALL,
            ):
                method = m.group('method')
                explicit_names = explicit_identifier_names(m.group('rest'), constants)
                suffix = f"_{method if method != 'foreign' else 'foreign'}"

                if explicit_names:
                    check_explicit_name(issues, explicit_names[0], fname)
                    continue

                columns = normalize_columns(m.group('columns'))
                if not columns:
                    continue

                auto = f"{table}_{columns}{suffix}"
                add_issue(
                    issues,
                    'AUTO-GEN',
                    auto,
                    fname,
                    f"add an explicit shorter name to the {method}() call.",
                )

            for m in re.finditer(
                r"\$table->(?P<type>\w+)\(\s*['\"](?P<column>[^'\"]+)['\"][^;]*?->(?P<method>index|unique)\((?P<args>[^)]*)\)",
                body,
                re.DOTALL,
            ):
                method = m.group('method')
                explicit_names = explicit_identifier_names(m.group('args'), constants)
                if explicit_names:
                    check_explicit_name(issues, explicit_names[0], fname)
                    continue

                auto = f"{table}_{m.group('column')}_{method}"
                add_issue(
                    issues,
                    'AUTO-GEN',
                    auto,
                    fname,
                    f"pass an explicit shorter name to ->{method}().",
                )

            for m in re.finditer(
                r"\$table->foreignId\(\s*['\"](?P<column>[^'\"]+)['\"][^;]*?->constrained\((?P<args>[^)]*)\)",
                body,
                re.DOTALL,
            ):
                explicit_names = []
                for argument in re.findall(
                    r"indexName\s*:\s*(?:['\"][^'\"]+['\"]|(?:self|static)::[A-Z][A-Z0-9_]*)",
                    m.group('args'),
                ):
                    explicit_names.extend(explicit_identifier_names(argument, constants))

                if explicit_names:
                    check_explicit_name(issues, explicit_names[0], fname)
                    continue

                auto = f"{table}_{m.group('column')}_foreign"
                add_issue(
                    issues,
                    'AUTO-GEN',
                    auto,
                    fname,
                    "pass indexName: '<shorter_name>' to constrained().",
                )

    return issues


def main() -> int:
    issues = check_migrations(MIGRATIONS_DIR)

    if issues:
        print(f"MySQL identifier length violations (limit: {MAX_LEN} chars):\n")
        for issue in issues:
            print(f"  x {issue}\n")
        print(f"{len(issues)} violation(s) found.")
        return 1

    print(f"OK: All migration identifiers are within {MAX_LEN} characters.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
