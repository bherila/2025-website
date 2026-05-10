<?php

namespace App\Services\Finance\CapitalGains;

use JsonSerializable;

class YearReconciliationReport implements JsonSerializable
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
        foreach ($this->documents() as $document) {
            foreach (($document['diagnostics'] ?? []) as $diagnostic) {
                if (is_array($diagnostic) && ($diagnostic['severity'] ?? null) === 'error') {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function documents(): array
    {
        $documents = $this->payload['documents'] ?? [];

        return is_array($documents) ? array_values(array_filter(
            $documents,
            static fn (mixed $document): bool => is_array($document),
        )) : [];
    }
}
