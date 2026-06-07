<?php

namespace App\Console\Commands\Finance;

use App\Models\User;
use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;
use App\Services\Finance\TaxReturnPdf\Exceptions\TaxReturnPdfUnavailableException;
use App\Services\Finance\TaxReturnPdf\IrsReturnPdfBuilder;
use Illuminate\Console\Command;
use RuntimeException;

class FinanceTaxReturnPdfCommand extends Command
{
    protected $signature = 'finance:tax-return-pdf
        {--user= : User ID to export; defaults to FINANCE_CLI_USER_ID or 1}
        {--year=2025 : Tax year}
        {--form=form-1040 : Individual form id}
        {--scope=form : Export scope: form or return}
        {--mode=editable : Export mode: editable or print}
        {--out=storage/app/testing/2025-form-1040-editable.pdf : Output PDF path}
        {--format=table : Reserved for finance CLI compatibility}';

    protected $description = 'Generate an IRS tax return PDF from backend Tax Preview facts when a native AcroForm engine is available.';

    public function __construct(
        private readonly IrsReturnPdfBuilder $pdfBuilder,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $userId = (int) ($this->option('user') ?: 1);
        $user = User::query()->find($userId);

        if (! $user instanceof User) {
            $this->error("User ID {$userId} not found.");

            return self::FAILURE;
        }

        $options = new TaxReturnPdfOptions(
            year: (int) $this->option('year'),
            scope: (string) $this->option('scope'),
            mode: (string) $this->option('mode'),
            formId: (string) $this->option('form'),
            filename: basename((string) $this->option('out')),
        );

        try {
            $content = $this->pdfBuilder->buildForUser($user, $options);
        } catch (TaxReturnPdfUnavailableException $exception) {
            foreach ($exception->errors as $error) {
                $this->error($error);
            }
            foreach ($exception->warnings as $warning) {
                $this->warn($warning);
            }

            return self::FAILURE;
        } catch (RuntimeException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        if ($content === '' || ! str_starts_with($content, '%PDF')) {
            $this->error('Generated payload is not a valid PDF.');

            return self::FAILURE;
        }

        $out = base_path((string) $this->option('out'));
        if (! is_dir(dirname($out))) {
            mkdir(dirname($out), 0775, true);
        }

        file_put_contents($out, $content);
        $this->info("Wrote {$out}");

        return self::SUCCESS;
    }
}
