<?php

namespace App\Services\Finance\TaxReturnPdf\Data;

readonly class TaxReturnPdfOptions
{
    public const array FORM_ORDER = ['form-1040', 'schedule-1', 'schedule-3', 'schedule-d', 'form-8949'];

    /**
     * @param  array<int, string>  $formIds
     */
    public function __construct(
        public int $year,
        public string $scope,
        public string $mode,
        public ?string $formId = null,
        public ?string $filename = null,
        public array $formIds = [],
        public bool $includeProfilePii = false,
    ) {}

    /**
     * @return array<int, string>
     */
    public function formIds(): array
    {
        if ($this->scope === 'form') {
            return [$this->formId ?? 'form-1040'];
        }

        if ($this->scope === 'selection') {
            return self::normalizeFormIds($this->formIds);
        }

        return ['form-1040'];
    }

    /**
     * @param  array<int, string>  $formIds
     * @return array<int, string>
     */
    public static function normalizeFormIds(array $formIds): array
    {
        return array_values(array_filter(
            self::FORM_ORDER,
            static fn (string $formId): bool => in_array($formId, $formIds, true),
        ));
    }
}
