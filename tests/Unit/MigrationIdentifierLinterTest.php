<?php

namespace Tests\Unit;

use Tests\TestCase;

/**
 * Migration identifier linter.
 *
 * Enforces the project-wide rule that every ->index(), ->unique(), ->foreign(),
 * ->dropIndex(), ->dropUnique(), ->dropForeign(), and ->constrained() call in a
 * migration must supply an explicit identifier name rather than relying on
 * Laravel's auto-generated name.  Explicit names must also be ≤ 64 characters
 * to stay within MySQL's identifier length limit.
 *
 * LEGACY_VIOLATIONS lists migrations that existed before this linter was
 * introduced and are therefore exempt (allow-listed).  All migrations created
 * after this list was established must comply.
 */
class MigrationIdentifierLinterTest extends TestCase
{
    /**
     * Migrations that pre-date this linter and contain legacy violations.
     * Do NOT add new migrations here; fix them instead.
     *
     * @var list<string>
     */
    private const LEGACY_VIOLATIONS = [
        '2026_03_05_000000_create_fin_account_lots_table.php',
        '2026_03_05_001906_add_hash_and_statement_id_to_finance_tables.php',
        '2026_03_05_100000_add_transaction_ids_to_fin_account_lots.php',
        '2026_03_17_000001_add_milestone_price_and_invoice_line_to_client_tasks.php',
        '2026_03_18_000001_create_fin_rules_tables.php',
        '2026_03_19_004809_create_fin_employment_entity_table.php',
        '2026_03_19_004817_add_employment_entity_id_to_fin_payslip_table.php',
        '2026_03_19_004822_add_employment_entity_id_to_fin_account_tag_table.php',
        '2026_03_22_063625_create_fin_transaction_non_duplicate_pairs_table.php',
        '2026_03_22_100000_create_webauthn_and_audit_tables.php',
        '2026_03_23_000001_create_genai_import_jobs_table.php',
        '2026_03_23_000002_create_genai_import_results_table.php',
        '2026_03_25_000001_add_genai_job_id_to_fin_statements.php',
        '2026_04_03_100000_create_fin_tax_documents_table.php',
        '2026_04_04_100000_add_genai_fields_to_fin_tax_documents.php',
        '2026_04_08_100002_create_fin_payslip_state_data_and_drop_flat_cols.php',
        '2026_04_08_100003_create_fin_payslip_deposits_table.php',
        '2026_04_11_062652_create_fin_tax_document_accounts_table.php',
        '2026_04_11_192648_add_tax_document_id_to_fin_account_lots.php',
        '2026_04_19_063834_add_is_deferred_billing_to_client_time_entries.php',
        '2026_04_19_223420_create_fin_user_tax_states_table.php',
        '2026_04_19_223421_create_fin_user_deductions_table.php',
        '2026_04_20_033435_create_fin_pal_carryforwards_table.php',
        '2026_04_27_065237_create_user_ai_configurations_table.php',
        '2026_04_27_091813_add_token_usage_to_genai_import_jobs_table.php',
        '2026_04_30_155528_add_reconciliation_fields_to_fin_account_lots.php',
        '2026_05_03_024157_add_cusip_to_fin_account_lots_table.php',
        '2026_05_03_171340_add_sync_timestamps_and_tombstones_to_fin_account_line_items.php',
        '2026_05_08_060626_create_fin_employment_entity_year_table.php',
        '2026_05_08_060626_create_fin_form_8829_inputs_table.php',
        '2026_05_08_060626_create_fin_tax_line_adjustments_table.php',
        '2026_05_08_074313_add_billing_cadence_to_client_management_tables.php',
        '2026_05_08_195453_create_client_company_activities_table.php',
        '2026_05_09_033615_create_client_company_stripe_customers_table.php',
        '2026_05_09_033618_create_client_company_payment_methods_table.php',
        '2026_05_09_033621_create_client_invoice_stripe_payments_table.php',
        '2026_05_09_223311_create_schedule_d_carryover_inputs_table.php',
        '2026_05_11_071310_create_fin_documents_unified_import_tables.php',
        '2026_05_17_042849_normalize_phr_patient_schema.php',
        '2026_05_17_184730_create_phr_conditions_table.php',
        '2026_05_17_184730_create_phr_medications_table.php',
        '2026_05_17_184730_create_phr_office_visits_table.php',
        '2026_05_17_184730_create_phr_procedures_table.php',
        '2026_05_17_184731_create_phr_allergies_table.php',
        '2026_05_17_184731_create_phr_immunizations_table.php',
        '2026_05_18_032651_create_class_action_claims_table.php',
        '2026_05_24_120000_create_fin_schedule_c_inputs_table.php',
        '2026_05_24_162017_create_fin_tax_document_form1116_overrides.php',
    ];

    private const MAX_IDENTIFIER_LENGTH = 64;

    /** @return array<string, string> basename => full path */
    private function migrationFiles(): array
    {
        $dir = database_path('migrations');
        $files = [];

        foreach (scandir($dir) as $entry) {
            if (str_ends_with($entry, '.php')) {
                $files[$entry] = $dir.DIRECTORY_SEPARATOR.$entry;
            }
        }

        ksort($files);

        return $files;
    }

    /**
     * Extract class constant values (const FOO = 'bar') from a file.
     *
     * @return array<string, string>
     */
    private function constantMap(string $content): array
    {
        preg_match_all(
            '/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*(?:\'([^\']+)\'|"([^"]+)")/',
            $content,
            $m,
            PREG_SET_ORDER,
        );

        $constants = [];
        foreach ($m as $match) {
            $constants[$match[1]] = $match[2] ?: $match[3];
        }

        return $constants;
    }

    /**
     * Detect ->index(), ->unique(), ->foreign(), ->dropIndex(), ->dropUnique(),
     * ->dropForeign() calls that do NOT supply an explicit name argument.
     *
     * An explicit name is a second string argument (or a self::CONST reference).
     * Callers that pass an array as the first argument to drop* without a second
     * argument are relying on auto-generated names.
     *
     * @param  array<string, string>  $constants
     * @return list<string> human-readable violation descriptions
     */
    private function findUnnamedCalls(string $content, array $constants, string $filename): array
    {
        $violations = [];

        // ->index(['col',...]) or ->index('col')  – no explicit second argument
        // Match: arrow method, opening paren, column arg(s), optional whitespace, closing paren
        $pattern = '/->(?P<method>index|unique|foreign)\s*\(\s*(?P<cols>\[[^\]]+\]|\'[^\']+\'|"[^"]+")\s*\)/';
        preg_match_all($pattern, $content, $matches, PREG_SET_ORDER);

        foreach ($matches as $match) {
            $violations[] = sprintf(
                '%s: ->%s(%s) has no explicit name argument — add a second string argument.',
                $filename,
                $match['method'],
                trim($match['cols']),
            );
        }

        // ->dropIndex(['col',...]) / ->dropUnique(['col',...]) / ->dropForeign(['col',...])
        // Passing an array means "auto-generate the name"; passing a string is explicit.
        $dropPattern = '/->(?P<method>dropIndex|dropUnique|dropForeign)\s*\(\s*\[/';
        preg_match_all($dropPattern, $content, $matches, PREG_SET_ORDER);

        foreach ($matches as $match) {
            $violations[] = sprintf(
                '%s: ->%s([...]) uses an auto-generated name — pass the explicit string identifier instead.',
                $filename,
                $match['method'],
            );
        }

        // ->foreignId('col')->constrained(...) without indexName: 'name'
        $constrainedPattern = '/->foreignId\s*\(\s*[\'"](?P<col>[^\'"]+)[\'"]\)[^;]*?->constrained\s*\((?P<args>[^)]*)\)/s';
        preg_match_all($constrainedPattern, $content, $matches, PREG_SET_ORDER);

        foreach ($matches as $match) {
            $args = $match['args'];
            // Has explicit indexName: 'name' or indexName: self::CONST?
            if (preg_match('/\bindexName\s*:/', $args)) {
                continue;
            }

            $violations[] = sprintf(
                "%s: ->foreignId('%s')->constrained(...) has no explicit indexName — add indexName: 'explicit_name'.",
                $filename,
                $match['col'],
            );
        }

        return $violations;
    }

    /**
     * Detect explicit identifier names that exceed MAX_IDENTIFIER_LENGTH.
     *
     * @param  array<string, string>  $constants
     * @return list<string>
     */
    private function findTooLongIdentifiers(string $content, array $constants, string $filename): array
    {
        $violations = [];
        $max = self::MAX_IDENTIFIER_LENGTH;

        // ->name('identifier')
        preg_match_all("/->name\s*\(\s*['\"]([^'\"]+)['\"]\s*\)/", $content, $m);
        foreach ($m[1] as $name) {
            if (strlen($name) > $max) {
                $violations[] = sprintf(
                    "%s: explicit identifier '%s' is %d chars (limit %d).",
                    $filename, $name, strlen($name), $max,
                );
            }
        }

        // indexName: 'identifier' or name: 'identifier' named arguments
        preg_match_all('/\b(?:indexName|name)\s*:\s*[\'"]([^\'"]+)[\'"]/', $content, $m);
        foreach ($m[1] as $name) {
            if (strlen($name) > $max) {
                $violations[] = sprintf(
                    "%s: explicit identifier '%s' is %d chars (limit %d).",
                    $filename, $name, strlen($name), $max,
                );
            }
        }

        // indexName: self::CONST or name: self::CONST
        preg_match_all('/\b(?:indexName|name)\s*:\s*(?:self|static)::([A-Z][A-Z0-9_]*)/', $content, $m);
        foreach ($m[1] as $constName) {
            if (isset($constants[$constName])) {
                $name = $constants[$constName];
                if (strlen($name) > $max) {
                    $violations[] = sprintf(
                        "%s: constant %s = '%s' is %d chars (limit %d).",
                        $filename, $constName, $name, strlen($name), $max,
                    );
                }
            }
        }

        // Second argument to ->index(), ->unique() when it is a plain string literal
        preg_match_all(
            '/->(?:index|unique|foreign)\s*\(\s*(?:\[[^\]]+\]|\'[^\']+\'|"[^"]+")\s*,\s*[\'"]([^\'"]+)[\'"]/',
            $content,
            $m,
        );
        foreach ($m[1] as $name) {
            if (strlen($name) > $max) {
                $violations[] = sprintf(
                    "%s: explicit identifier '%s' is %d chars (limit %d).",
                    $filename, $name, strlen($name), $max,
                );
            }
        }

        // Second argument to ->index(), ->unique() when it is a class constant
        preg_match_all(
            '/->(?:index|unique|foreign)\s*\(\s*(?:\[[^\]]+\]|\'[^\']+\'|"[^"]+")\s*,\s*(?:self|static)::([A-Z][A-Z0-9_]*)/',
            $content,
            $m,
        );
        foreach ($m[1] as $constName) {
            if (isset($constants[$constName])) {
                $name = $constants[$constName];
                if (strlen($name) > $max) {
                    $violations[] = sprintf(
                        "%s: constant %s = '%s' is %d chars (limit %d).",
                        $filename, $constName, $name, strlen($name), $max,
                    );
                }
            }
        }

        return $violations;
    }

    /**
     * All new migrations (those not in LEGACY_VIOLATIONS) must supply explicit
     * name arguments to every index/unique/foreign/drop* call.
     */
    public function test_new_migrations_use_explicit_identifier_names(): void
    {
        $violations = [];

        foreach ($this->migrationFiles() as $basename => $path) {
            if (in_array($basename, self::LEGACY_VIOLATIONS, true)) {
                continue;
            }

            $content = (string) file_get_contents($path);
            $constants = $this->constantMap($content);
            $found = $this->findUnnamedCalls($content, $constants, $basename);
            array_push($violations, ...$found);
        }

        $this->assertEmpty(
            $violations,
            "Migration identifier violations found in new migrations.\n".
            'Every ->index(), ->unique(), ->foreign(), ->dropIndex(), ->dropUnique(), ->dropForeign(), '.
            "and ->constrained() call must supply an explicit name argument.\n".
            "Violations:\n  ".implode("\n  ", $violations),
        );
    }

    /**
     * All migrations (including legacy) must keep explicit identifier names
     * within the MySQL 64-character limit.
     */
    public function test_all_explicit_identifiers_are_within_64_chars(): void
    {
        $violations = [];

        foreach ($this->migrationFiles() as $basename => $path) {
            $content = (string) file_get_contents($path);
            $constants = $this->constantMap($content);
            $found = $this->findTooLongIdentifiers($content, $constants, $basename);
            array_push($violations, ...$found);
        }

        $this->assertEmpty(
            $violations,
            "Identifier length violations found.\n".
            "All explicit migration identifiers must be ≤ 64 characters.\n".
            "Violations:\n  ".implode("\n  ", $violations),
        );
    }

    // -------------------------------------------------------------------------
    // Failure-path tests: verify the linter actually CATCHES violations.
    // -------------------------------------------------------------------------

    /**
     * A migration with ->index('col') and no explicit name argument must be
     * reported as a violation.
     */
    public function test_linter_catches_index_without_explicit_name(): void
    {
        $source = <<<'PHP'
            $table->index('user_id');
            PHP;

        $violations = $this->findUnnamedCalls($source, [], 'fixture_no_name.php');

        $this->assertNotEmpty(
            $violations,
            'Expected a violation for ->index() with no explicit name, but none was reported.',
        );
        $this->assertStringContainsString('->index(', $violations[0]);
    }

    /**
     * A migration with ->foreignId('col')->constrained() and no indexName:
     * argument must be reported as a violation.
     */
    public function test_linter_catches_constrained_without_index_name(): void
    {
        $source = <<<'PHP'
            $table->foreignId('account_id')->constrained('fin_accounts');
            PHP;

        $violations = $this->findUnnamedCalls($source, [], 'fixture_constrained.php');

        $this->assertNotEmpty(
            $violations,
            'Expected a violation for ->constrained() with no indexName, but none was reported.',
        );
        $this->assertStringContainsString("->foreignId('account_id')->constrained", $violations[0]);
    }

    /**
     * An explicit index name that exceeds 64 characters must be reported as a
     * length violation.
     */
    public function test_linter_catches_identifier_exceeding_64_chars(): void
    {
        // 65-character name — one over the limit.
        $longName = 'this_is_a_really_long_explicit_name_that_clearly_exceeds_sixtyfour_chars_idx';
        $this->assertGreaterThan(self::MAX_IDENTIFIER_LENGTH, strlen($longName));

        $source = "\$table->index(['col1', 'col2'], '{$longName}');";

        $violations = $this->findTooLongIdentifiers($source, [], 'fixture_long_name.php');

        $this->assertNotEmpty(
            $violations,
            'Expected a violation for an identifier exceeding 64 chars, but none was reported.',
        );
        $this->assertStringContainsString($longName, $violations[0]);
    }
}
