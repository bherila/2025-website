<?php

namespace App\Services\Finance;

class K1CodeCharacterResolver
{
    /**
     * Resolve Schedule D character metadata for a K-1 coded statement row.
     *
     * This inspector mirrors the client-side read-time classifier in
     * resources/js/lib/finance/k1Utils.ts. Keep both implementations pinned to the
     * fixture set under resources/js/lib/finance/__tests__/fixtures.
     *
     * @param  array<string, mixed>  $item
     * @return array{character: 'short'|'long', source: 'stored'|'notes'}|null
     */
    public function resolve(string $box, array $item): ?array
    {
        $storedCharacter = $this->normalizeCharacter($item['character'] ?? null);

        if ($storedCharacter !== null) {
            return [
                'character' => $storedCharacter,
                'source' => 'stored',
            ];
        }

        if ($this->normalizeBox($box) !== '11' || $this->normalizeCode($item['code'] ?? null) !== 'S') {
            return null;
        }

        $derivedCharacter = $this->classify11SNotes($item['notes'] ?? null);

        if ($derivedCharacter === null) {
            return null;
        }

        return [
            'character' => $derivedCharacter,
            'source' => 'notes',
        ];
    }

    public function normalizeCode(mixed $code): string
    {
        return strtoupper(trim((string) $code));
    }

    private function normalizeBox(string $box): string
    {
        return strtoupper(trim($box));
    }

    private function normalizeCharacter(mixed $character): ?string
    {
        $normalized = strtolower(trim((string) $character));

        return match ($normalized) {
            'short', 'st', 'short-term', 'short term' => 'short',
            'long', 'lt', 'long-term', 'long term' => 'long',
            default => null,
        };
    }

    private function classify11SNotes(mixed $notes): ?string
    {
        if (! is_string($notes) || trim($notes) === '') {
            return null;
        }

        $hasShort = preg_match('/\b(?:short[\s-]+term|st(?=\s+capital\b))\b/i', $notes) === 1;
        $hasLong = preg_match('/\b(?:long[\s-]+term|lt(?=\s+capital\b))\b/i', $notes) === 1;

        if ($hasShort === $hasLong) {
            return null;
        }

        return $hasShort ? 'short' : 'long';
    }
}
