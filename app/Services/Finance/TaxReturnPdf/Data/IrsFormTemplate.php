<?php

namespace App\Services\Finance\TaxReturnPdf\Data;

readonly class IrsFormTemplate
{
    public function __construct(
        public string $formId,
        public string $name,
        public int $taxYear,
        public string $path,
        public string $sha256,
        public string $sourceUrl,
        public string $revision,
        public bool $fillable,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public static function fromArray(string $formId, array $data): self
    {
        return new self(
            formId: $formId,
            name: (string) ($data['name'] ?? $formId),
            taxYear: (int) $data['taxYear'],
            path: (string) $data['path'],
            sha256: strtolower((string) $data['sha256']),
            sourceUrl: (string) ($data['sourceUrl'] ?? ''),
            revision: (string) ($data['revision'] ?? ''),
            fillable: (bool) ($data['fillable'] ?? false),
        );
    }
}
