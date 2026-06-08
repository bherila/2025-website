<?php

namespace App\Services\Finance\TaxReturnPdf\Data;

readonly class IrsReturnReadinessResult
{
    /**
     * @param  array<int, string>  $errors
     * @param  array<int, string>  $warnings
     * @param  array<int, string>  $requiredForms
     * @param  array<int, string>  $unsupportedForms
     */
    public function __construct(
        public array $errors = [],
        public array $warnings = [],
        public array $requiredForms = ['form-1040'],
        public array $unsupportedForms = [],
    ) {}

    public function isReady(): bool
    {
        return $this->errors === [];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'ready' => $this->isReady(),
            'errors' => $this->errors,
            'warnings' => $this->warnings,
            'requiredForms' => $this->requiredForms,
            'unsupportedForms' => $this->unsupportedForms,
        ];
    }
}
