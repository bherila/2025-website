<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;

interface IrsAcroFormFillEngine
{
    /**
     * @param  array<string, string|bool|null>  $fieldValues
     */
    public function fill(string $templatePath, array $fieldValues, TaxReturnPdfOptions $options): string;

    /**
     * @return array<int, array<string, mixed>>
     */
    public function dumpFields(string $templatePath): array;

    public function supportsEditableOutput(): bool;
}
