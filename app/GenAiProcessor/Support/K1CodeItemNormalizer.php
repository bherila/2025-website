<?php

namespace App\GenAiProcessor\Support;

class K1CodeItemNormalizer
{
    /**
     * Normalize raw K-1 code items from the Gemini tool call into the frontend
     * FK1StructuredData K1CodeItem shape.
     *
     * @param  array<mixed>  $rawItems
     * @return array<int, array{code: string, value: string, notes: string, character?: 'short'|'long'}>
     */
    public function normalize(array $rawItems): array
    {
        $result = [];

        foreach ($rawItems as $item) {
            if (! is_array($item) || ! isset($item['code'])) {
                continue;
            }

            $rawValue = $item['value'] ?? null;
            $rawCharacter = isset($item['character']) ? strtolower(trim((string) $item['character'])) : '';
            $entry = [
                'code' => strtoupper(trim((string) $item['code'])),
                'value' => is_numeric($rawValue) ? (string) (float) $rawValue : (string) ($rawValue ?? ''),
                'notes' => isset($item['notes']) ? (string) $item['notes'] : '',
            ];

            if ($rawCharacter === 'short' || $rawCharacter === 'long') {
                $entry['character'] = $rawCharacter;
            }

            $result[] = $entry;
        }

        return $result;
    }
}
