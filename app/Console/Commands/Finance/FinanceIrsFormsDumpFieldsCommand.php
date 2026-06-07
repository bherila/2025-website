<?php

namespace App\Console\Commands\Finance;

use App\Services\Finance\TaxReturnPdf\Data\IrsFieldDefinition;
use App\Services\Finance\TaxReturnPdf\IrsFieldDumpService;
use App\Services\Finance\TaxReturnPdf\IrsPdfTemplateRepository;
use Illuminate\Console\Command;

class FinanceIrsFormsDumpFieldsCommand extends Command
{
    protected $signature = 'finance:irs-forms:dump-fields
        {--year=2025 : Tax year}
        {--form=form-1040 : IRS form id from the local manifest}
        {--format=table : Reserved for finance CLI compatibility}';

    protected $description = 'Dump AcroForm fields from a pinned IRS PDF template without PDFtk or Java.';

    public function __construct(
        private readonly IrsPdfTemplateRepository $templates,
        private readonly IrsFieldDumpService $fieldDumpService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $year = (int) $this->option('year');
        $formId = (string) $this->option('form');
        $template = $this->templates->template($year, $formId);
        $fields = $this->fieldDumpService->dump($this->templates->templatePath($template));
        $directory = resource_path("irs/fields/{$year}");

        if (! is_dir($directory)) {
            mkdir($directory, 0775, true);
        }

        $jsonPath = "{$directory}/{$formId}.fields.json";
        $txtPath = "{$directory}/{$formId}.fields.txt";

        file_put_contents(
            $jsonPath,
            json_encode(array_map(static fn (IrsFieldDefinition $field): array => $field->toArray(), $fields), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n",
        );
        file_put_contents($txtPath, $this->textDump($fields));

        $this->info("Wrote {$jsonPath}");
        $this->info("Wrote {$txtPath}");
        $this->line(count($fields).' field(s)');

        return self::SUCCESS;
    }

    /**
     * @param  array<int, IrsFieldDefinition>  $fields
     */
    private function textDump(array $fields): string
    {
        $lines = [];

        foreach ($fields as $field) {
            $lines[] = sprintf(
                '%s | type=%s | page=%s | object=%s | value=%s | default=%s | flags=%s | maxLength=%s | rect=%s | states=%s | options=%s',
                $field->name,
                $field->type ?? '',
                $field->page === null ? '' : (string) $field->page,
                $field->objectId ?? '',
                $field->value ?? '',
                $field->defaultValue ?? '',
                $field->flags === null ? '' : (string) $field->flags,
                $field->maxLength === null ? '' : (string) $field->maxLength,
                implode(',', $field->rect),
                implode(',', $field->states),
                implode(',', $field->options),
            );
        }

        return implode("\n", $lines)."\n";
    }
}
