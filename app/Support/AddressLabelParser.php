<?php

namespace App\Support;

class AddressLabelParser
{
    /**
     * @return array<int, array<int, string>>
     */
    public function parse(string $input, string $mode = 'auto'): array
    {
        $normalized = str_replace(["\r\n", "\r"], "\n", trim($input));
        if ($normalized === '') {
            return [];
        }

        if ($mode === 'blocks' || ($mode === 'auto' && preg_match('/\n\s*\n/', $normalized))) {
            return $this->parseBlocks($normalized);
        }

        return $this->parseDelimited($normalized);
    }

    /**
     * @return array<int, array<int, string>>
     */
    private function parseDelimited(string $input): array
    {
        $delimiter = substr_count($input, "\t") > substr_count($input, ',') ? "\t" : ',';
        $rows = [];
        $handle = fopen('php://temp', 'r+');
        if ($handle === false) {
            return [];
        }

        fwrite($handle, $input);
        rewind($handle);

        while (($cells = fgetcsv($handle, 0, $delimiter)) !== false) {
            $trimmed = $this->normalizeDelimitedCells($cells);
            if (count(array_filter($trimmed, fn ($c): bool => $c !== '')) === 0) {
                continue;
            }

            $rows[] = $trimmed;
        }

        fclose($handle);

        return $rows;
    }

    /**
     * @param  array<int, string|null>  $cells
     * @return array<int, string>
     */
    private function normalizeDelimitedCells(array $cells): array
    {
        $lines = [];

        foreach ($cells as $cell) {
            $normalized = str_replace(["\r\n", "\r"], "\n", trim((string) $cell));

            foreach (explode("\n", $normalized) as $line) {
                $lines[] = trim($line);
            }
        }

        return $lines;
    }

    /**
     * @return array<int, array<int, string>>
     */
    private function parseBlocks(string $input): array
    {
        $blocks = preg_split('/\n\s*\n/', $input) ?: [];
        $rows = [];

        foreach ($blocks as $block) {
            $lines = array_values(array_filter(array_map('trim', explode("\n", trim($block))), fn ($line): bool => $line !== ''));
            if (count($lines) > 0) {
                $rows[] = $lines;
            }
        }

        return $rows;
    }
}
