<?php

namespace App\Services\Finance\TaxReturnPdf\Data;

readonly class TaxReturnPdfBuildResult
{
    /**
     * @param  array<int, string>  $formIds
     * @param  array<int, string>  $warnings
     */
    public function __construct(
        public string $content,
        public array $formIds,
        public array $warnings = [],
    ) {}
}
