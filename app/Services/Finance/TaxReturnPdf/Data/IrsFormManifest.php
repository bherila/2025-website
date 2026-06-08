<?php

namespace App\Services\Finance\TaxReturnPdf\Data;

readonly class IrsFormManifest
{
    /**
     * @param  array<string, IrsFormTemplate>  $templates
     */
    public function __construct(
        public int $taxYear,
        public string $source,
        public string $downloadedAt,
        public array $templates,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public static function fromArray(array $data): self
    {
        $templates = [];

        foreach (($data['templates'] ?? []) as $formId => $template) {
            if (is_array($template)) {
                $templates[(string) $formId] = IrsFormTemplate::fromArray((string) $formId, $template);
            }
        }

        return new self(
            taxYear: (int) $data['taxYear'],
            source: (string) ($data['source'] ?? ''),
            downloadedAt: (string) ($data['downloadedAt'] ?? ''),
            templates: $templates,
        );
    }
}
