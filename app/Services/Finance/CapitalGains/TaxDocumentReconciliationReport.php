<?php

namespace App\Services\Finance\CapitalGains;

use JsonSerializable;

class TaxDocumentReconciliationReport implements JsonSerializable
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public function __construct(
        private readonly array $payload,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return $this->payload;
    }

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }

    public function hasErrorDiagnostics(): bool
    {
        foreach ($this->diagnostics() as $diagnostic) {
            if (($diagnostic['severity'] ?? null) === 'error') {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function diagnostics(): array
    {
        $diagnostics = $this->payload['diagnostics'] ?? [];

        return is_array($diagnostics) ? array_values(array_filter(
            $diagnostics,
            static fn (mixed $diagnostic): bool => is_array($diagnostic),
        )) : [];
    }
}
