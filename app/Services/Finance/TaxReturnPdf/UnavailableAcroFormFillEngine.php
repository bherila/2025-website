<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;
use App\Services\Finance\TaxReturnPdf\Exceptions\TaxReturnPdfUnavailableException;

class UnavailableAcroFormFillEngine implements IrsAcroFormFillEngine
{
    public const string REASON = 'Native editable IRS PDF filling is blocked: FPDM rejects the current official Form 1040 PDF because it is linearized/Fast Web View, and this project must not require PDFtk or Java preprocessing.';

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
