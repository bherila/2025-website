<?php

namespace App\Console\Commands\Finance;

use App\Models\Files\FileForTaxDocument;

class FinanceTaxDocsCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:tax-docs
        {--year= : Tax year to list (required)}
        {--account= : Filter to documents linked to a specific account ID}
        {--format=table : Output format: table or json}';

    protected $description = 'List tax documents for a given year (FINANCE_CLI_USER_ID)';

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
            ->with(['accountLinks'])
            ->orderBy('form_type')
            ->orderBy('id');

        if ($this->option('account') !== null) {
            $accountId = (int) $this->option('account');
            $query->whereHas('accountLinks', fn ($q) => $q->where('account_id', $accountId));
        }

        $docs = $query->get();

        $headers = ['id', 'form_type', 'tax_year', 'genai_status', 'original_filename'];

        $rows = $docs->map(fn ($doc) => [
            $doc->id,
            $doc->form_type,
            $doc->tax_year,
            $doc->genai_status ?? '',
            $doc->original_filename ?? '',
        ])->toArray();

        $data = $docs->map(fn ($doc) => array_merge(
            [
                'id' => $doc->id,
                'user_id' => $doc->user_id,
                'tax_year' => $doc->tax_year,
                'form_type' => $doc->form_type,
                'original_filename' => $doc->original_filename,
                'genai_status' => $doc->genai_status,
            ],
            ['account_ids' => $doc->accountLinks->pluck('account_id')->filter()->values()->toArray()]
        ))->toArray();

        $this->outputData($headers, $rows, $data);

        return 0;
    }
}
