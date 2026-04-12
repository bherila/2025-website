<?php

namespace App\Console\Commands\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\K1LegacyTransformer;

class FinanceTaxRenderCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:tax-render
        {--year= : Tax year to render (required)}
        {--form= : Filter to a single form type (e.g. w2, 1099_int, k1, broker_1099)}
        {--format=table : Output format: table or json}';

    protected $description = 'Render a summary of tax forms for a given year (FINANCE_CLI_USER_ID)';

    public function handle(): int
    {
        if (! $this->validateFormat()) {
            return 1;
        }

        $year = $this->option('year');
        if (! $year || ! ctype_digit((string) $year) || (int) $year < 1900 || (int) $year > 2100) {
            $this->error('--year is required and must be a valid 4-digit year (e.g. --year=2024).');

            return 1;
        }

        if ($this->resolveUser() === null) {
            return 1;
        }

        $query = FileForTaxDocument::where('user_id', $this->userId())
            ->where('tax_year', (int) $year)
            ->whereNotNull('parsed_data')
            ->orderBy('form_type')
            ->orderBy('id');

        if ($this->option('form') !== null) {
            $query->where('form_type', $this->option('form'));
        }

        $docs = $query->get();

        $format = $this->option('format') ?? 'table';

        if ($format === 'json') {
            $output = $docs->map(fn ($doc) => $this->renderDocJson($doc))->toArray();
            $this->outputJson($output);

            return 0;
        }

        if ($docs->isEmpty()) {
            $this->line('No tax documents with parsed data found for year '.$year.'.');

            return 0;
        }

        foreach ($docs as $doc) {
            $this->renderDocTable($doc);
            $this->line('');
        }

        return 0;
    }

    /**
     * Render a single document to the terminal in human-readable format.
     */
    private function renderDocTable(FileForTaxDocument $doc): void
    {
        $formType = $doc->form_type;
        $label = strtoupper(str_replace('_', '-', $formType));
        $this->line("=== [{$doc->id}] {$label} — {$doc->tax_year} ===");
        if ($doc->original_filename) {
            $this->line('File: '.$doc->original_filename);
        }

        $data = $doc->parsed_data;

        if (! is_array($data)) {
            $this->warn('  (no parsed data)');

            return;
        }

        match ($formType) {
            'w2', 'w2c' => $this->renderW2Table($data),
            '1099_int', '1099_int_c' => $this->render1099IntTable($data),
            'k1' => $this->renderK1Table($data),
            default => $this->renderGenericTable($data),
        };
    }

    /**
     * Render document as a JSON-serialisable array.
     *
     * @return array<string, mixed>
     */
    private function renderDocJson(FileForTaxDocument $doc): array
    {
        $data = $doc->parsed_data;

        return [
            'id' => $doc->id,
            'form_type' => $doc->form_type,
            'tax_year' => $doc->tax_year,
            'original_filename' => $doc->original_filename,
            'genai_status' => $doc->genai_status,
            'parsed_data' => $data,
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function renderW2Table(array $data): void
    {
        $this->line(sprintf('  Employer : %s (EIN: %s)', $data['employer_name'] ?? '(unknown)', $data['employer_ein'] ?? '(unknown)'));
        $this->line(sprintf('  Employee : %s (SSN last4: %s)', $data['employee_name'] ?? '(unknown)', $data['employee_ssn_last4'] ?? '****'));
        $this->line('');

        $fields = [
            ['Box 1  — Wages, tips, other comp.', $data['box1_wages'] ?? null],
            ['Box 2  — Federal income tax withheld', $data['box2_fed_tax'] ?? null],
            ['Box 3  — Social Security wages', $data['box3_ss_wages'] ?? null],
            ['Box 4  — Social Security tax withheld', $data['box4_ss_tax'] ?? null],
            ['Box 5  — Medicare wages & tips', $data['box5_medicare_wages'] ?? null],
            ['Box 6  — Medicare tax withheld', $data['box6_medicare_tax'] ?? null],
            ['Box 10 — Dependent care benefits', $data['box10_dependent_care'] ?? null],
            ['Box 11 — Nonqualified plans', $data['box11_nonqualified'] ?? null],
            ['Box 15 — State', $data['box15_state'] ?? null],
            ['Box 16 — State wages', $data['box16_state_wages'] ?? null],
            ['Box 17 — State income tax', $data['box17_state_tax'] ?? null],
        ];

        foreach ($fields as [$label, $value]) {
            if ($value !== null) {
                $this->line(sprintf('  %-42s %s', $label, is_numeric($value) ? number_format((float) $value, 2) : $value));
            }
        }

        // Box 12 codes
        if (! empty($data['box12_codes'])) {
            $this->line('');
            $this->line('  Box 12 codes:');
            foreach ((array) $data['box12_codes'] as $entry) {
                if (is_array($entry)) {
                    $code = $entry['code'] ?? '?';
                    $amount = isset($entry['amount']) ? number_format((float) $entry['amount'], 2) : '?';
                    $this->line("    Code {$code}: {$amount}");
                }
            }
        }

        // Box 14 other
        if (! empty($data['box14_other'])) {
            $this->line('');
            $this->line('  Box 14 other:');
            foreach ((array) $data['box14_other'] as $entry) {
                if (is_array($entry)) {
                    $label = $entry['label'] ?? '?';
                    $amount = isset($entry['amount']) ? number_format((float) $entry['amount'], 2) : '?';
                    $this->line("    {$label}: {$amount}");
                }
            }
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function render1099IntTable(array $data): void
    {
        $this->line(sprintf('  Payer   : %s (TIN: %s)', $data['payer_name'] ?? '(unknown)', $data['payer_tin'] ?? '(unknown)'));
        $this->line(sprintf('  Account : %s', $data['account_number'] ?? '(unknown)'));
        $this->line('');

        $fields = [
            ['Box 1  — Interest income', $data['box1_interest'] ?? null],
            ['Box 2  — Early withdrawal penalty', $data['box2_early_withdrawal'] ?? null],
            ['Box 3  — Savings bond interest', $data['box3_savings_bond'] ?? null],
            ['Box 4  — Federal income tax withheld', $data['box4_fed_tax'] ?? null],
            ['Box 5  — Investment expenses', $data['box5_investment_expense'] ?? null],
            ['Box 6  — Foreign tax paid', $data['box6_foreign_tax'] ?? null],
            ['Box 7  — Foreign country/possession', $data['box7_foreign_country'] ?? null],
            ['Box 8  — Tax-exempt interest', $data['box8_tax_exempt'] ?? null],
            ['Box 9  — Private activity bond interest', $data['box9_private_activity'] ?? null],
            ['Box 10 — Market discount', $data['box10_market_discount'] ?? null],
            ['Box 11 — Bond premium', $data['box11_bond_premium'] ?? null],
        ];

        foreach ($fields as [$label, $value]) {
            if ($value !== null && $value !== 0 && $value !== 0.0) {
                $this->line(sprintf('  %-42s %s', $label, is_numeric($value) ? number_format((float) $value, 2) : $value));
            }
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function renderK1Table(array $data): void
    {
        // Apply legacy transformer defensively (already handled by model accessor,
        // but guard here in case raw data is passed from another path).
        if (K1LegacyTransformer::isLegacy($data)) {
            $data = K1LegacyTransformer::transform($data);
        }

        $schemaVersion = $data['schemaVersion'] ?? '(unknown)';
        $formType = $data['formType'] ?? 'K-1';
        $this->line("  Schema  : {$schemaVersion}  Form: {$formType}");

        // Entity / partner info from structured fields
        $fields = $data['fields'] ?? [];
        if (! empty($fields)) {
            $this->line('');
            $this->line('  Header fields:');
            foreach ($fields as $box => $entry) {
                if (is_array($entry) && isset($entry['value'])) {
                    $this->line(sprintf('    %-4s %s', $box.':', $entry['value']));
                }
            }
        }

        // Coded box entries
        $codes = $data['codes'] ?? [];
        if (! empty($codes)) {
            $this->line('');
            $this->line('  Box codes:');
            foreach ($codes as $box => $entries) {
                if (! is_array($entries)) {
                    continue;
                }
                foreach ($entries as $entry) {
                    if (! is_array($entry)) {
                        continue;
                    }
                    $code = $entry['code'] ?? '?';
                    $value = $entry['value'] ?? '?';
                    $notes = isset($entry['notes']) ? '  // '.mb_strimwidth((string) $entry['notes'], 0, 60, '…') : '';
                    $this->line(sprintf('    Box %-3s Code %-4s %s%s', $box, $code.':', $value, $notes));
                }
            }
        }

        // Warnings
        if (! empty($data['warnings'])) {
            $this->line('');
            $this->line('  Warnings:');
            foreach ((array) $data['warnings'] as $w) {
                $this->line('    ⚠ '.$w);
            }
        }
    }

    /**
     * Generic fallback renderer: dumps key/value pairs.
     *
     * @param  array<string, mixed>  $data
     */
    private function renderGenericTable(array $data): void
    {
        foreach ($data as $key => $value) {
            if (is_array($value)) {
                $this->line(sprintf('  %-32s %s', $key.':', json_encode($value)));
            } elseif ($value !== null) {
                $this->line(sprintf('  %-32s %s', $key.':', $value));
            }
        }
    }
}
