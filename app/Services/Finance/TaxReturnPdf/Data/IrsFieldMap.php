<?php

namespace App\Services\Finance\TaxReturnPdf\Data;

readonly class IrsFieldMap
{
    /**
     * @param  array<int, array<string, mixed>>  $mappings
     */
    public function __construct(
        public int $taxYear,
        public string $formId,
        public string $templateRevision,
        public array $mappings,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public static function fromArray(array $data): self
    {
        return new self(
            taxYear: (int) $data['taxYear'],
            formId: (string) $data['formId'],
            templateRevision: (string) ($data['templateRevision'] ?? ''),
            mappings: is_array($data['mappings'] ?? null) ? array_values($data['mappings']) : [],
        );
    }
}
