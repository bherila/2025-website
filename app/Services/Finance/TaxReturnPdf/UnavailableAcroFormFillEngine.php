<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;
use App\Services\Finance\TaxReturnPdf\Exceptions\TaxReturnPdfUnavailableException;

class UnavailableAcroFormFillEngine implements IrsAcroFormFillEngine
{
    public const string REASON = 'IRS PDF filling is unavailable because no fill engine is currently bound.';

    public function __construct(
        private readonly IrsFieldDumpService $fieldDumpService,
    ) {}

    /**
     * @param  array<string, string|bool|null>  $fieldValues
     */
    public function fill(string $templatePath, array $fieldValues, TaxReturnPdfOptions $options): string
    {
        throw new TaxReturnPdfUnavailableException([self::REASON]);
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
        return false;
    }
}
