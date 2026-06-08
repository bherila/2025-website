<?php

namespace App\Services\Finance\TaxReturnPdf\Data;

readonly class TaxReturnPdfBuildResult
{
    /**
     * @param  array<int, string>  $formIds
     */
    public function __construct(
        public string $content,
        public array $formIds,
    ) {}
}
