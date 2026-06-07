<?php

namespace App\Services\Finance\TaxReturnPdf\Data;

readonly class TaxReturnPdfOptions
{
    public function __construct(
        public int $year,
        public string $scope,
        public string $mode,
        public ?string $formId = null,
        public ?string $filename = null,
    ) {}

    /**
     * @return array<int, string>
     */
    public function formIds(): array
    {
        if ($this->scope === 'form') {
            return [$this->formId ?? ''];
        }

        return ['form-1040'];
    }
}
