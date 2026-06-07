<?php

namespace App\Console\Commands\Finance;

use App\Services\Finance\TaxReturnPdf\IrsPdfTemplateRepository;
use Illuminate\Console\Command;
use Throwable;

class FinanceIrsFormFillSpikeCommand extends Command
{
    protected $signature = 'finance:irs-form-fill-spike
        {--year=2025 : Tax year}
        {--form=form-1040 : IRS form id from the local manifest}
        {--out=storage/app/testing/f1040-fpdm-spike.pdf : Output path for the spike PDF}
        {--format=table : Reserved for finance CLI compatibility}';

    protected $description = 'Spike FPDM fillability against a pinned IRS fillable PDF template.';

    public function __construct(
        private readonly IrsPdfTemplateRepository $templates,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        if (! class_exists('FPDM')) {
            $this->error('FPDM is not installed. It was removed after the spike showed the current IRS Form 1040 PDF cannot be filled by FPDM without preprocessing.');

            return self::FAILURE;
        }

        $year = (int) $this->option('year');
        $formId = (string) $this->option('form');
        $out = base_path((string) $this->option('out'));
        $template = $this->templates->template($year, $formId);

        try {
            $fpdmClass = 'FPDM';
            $pdf = new $fpdmClass($this->templates->templatePath($template));
            $pdf->useCheckboxParser = true;
            $pdf->Load([
                'f1_01[0]' => 'FPDM',
                'f1_02[0]' => 'SPIKE',
                'c1_1[0]' => true,
                'c1_34[0]' => true,
            ], true);
            $pdf->Merge(false);
            $content = $pdf->Output('S');
        } catch (Throwable $throwable) {
            $this->error('FPDM spike failed: '.$throwable->getMessage());

            return self::FAILURE;
        }

        if (! is_string($content) || $content === '' || ! str_starts_with($content, '%PDF')) {
            $this->error('FPDM spike did not return a valid PDF payload.');

            return self::FAILURE;
        }

        if (! is_dir(dirname($out))) {
            mkdir(dirname($out), 0775, true);
        }

        file_put_contents($out, $content);
        $this->info("Wrote {$out}");

        return self::SUCCESS;
    }
}
