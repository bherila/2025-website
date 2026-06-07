<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;
use App\Services\Finance\TaxReturnPdf\Exceptions\TaxReturnPdfUnavailableException;

class SetaPdfAcroFormFillEngine implements IrsAcroFormFillEngine
{
    public function __construct(
        private readonly IrsFieldDumpService $fieldDumpService,
    ) {}

    /**
     * @param  array<string, string|bool|null>  $fieldValues
     */
    public function fill(string $templatePath, array $fieldValues, TaxReturnPdfOptions $options): string
    {
        if (! class_exists('\SetaPDF_Core_Document')) {
            throw new TaxReturnPdfUnavailableException([
                'SetaPDF-FormFiller is not installed. Add the licensed SetaPDF packages before enabling this native PHP engine.',
            ]);
        }

        throw new TaxReturnPdfUnavailableException([
            'SetaPDF-FormFiller scaffolding is present, but the licensed implementation is not wired in this repository.',
        ]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function dumpFields(string $templatePath): array
    {
        return $this->fieldDumpService->dumpArray($templatePath);
    }

    public function supportsEditableOutput(): bool
    {
        return class_exists('\SetaPDF_Core_Document');
    }
}
