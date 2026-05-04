<?php

namespace App\Services\Finance;

class TaxReturnReconciliationService
{
    /**
     * @param  array<string, mixed>  $facts
     * @param  array<string, mixed>  $fixture
     * @return array{fixture:array<string,mixed>,summary:array<string,mixed>,results:array<int,array<string,mixed>>}
     */
    public function reconcile(array $facts, array $fixture, ?float $defaultTolerance = null): array
    {
        $results = [];

        foreach ($this->fixtureLines($fixture) as $line) {
            $precision = $this->linePrecision($line);
            $tolerance = $this->lineTolerance($line, $defaultTolerance);
            $expected = $this->numeric($line['expected'] ?? null);
            $actual = $this->actualValue($facts, (string) ($line['path'] ?? ''));

            $status = 'matched';
            $roundedExpected = $expected !== null ? round($expected, $precision) : null;
            $roundedActual = $actual !== null ? round($actual, $precision) : null;
            $delta = $roundedExpected !== null && $roundedActual !== null
                ? round($roundedActual - $roundedExpected, max(2, $precision))
                : null;

            if ($actual === null) {
                $status = 'missing';
            } elseif ($expected === null || $delta === null || abs($delta) > $tolerance) {
                $status = 'mismatched';
            }

            $results[] = [
                'form' => (string) ($line['form'] ?? ''),
                'line' => (string) ($line['line'] ?? ''),
                'label' => (string) ($line['label'] ?? ''),
                'path' => (string) ($line['path'] ?? ''),
                'expected' => $expected,
                'actual' => $actual,
                'roundedExpected' => $roundedExpected,
                'roundedActual' => $roundedActual,
                'delta' => $delta,
                'precision' => $precision,
                'tolerance' => $tolerance,
                'status' => $status,
                'notes' => isset($line['notes']) ? (string) $line['notes'] : null,
            ];
        }

        return [
            'fixture' => [
                'label' => (string) ($fixture['label'] ?? 'Tax return reconciliation'),
                'year' => $fixture['year'] ?? ($facts['year'] ?? null),
                'fixtureVersion' => $fixture['fixtureVersion'] ?? null,
                'lineCount' => count($results),
            ],
            'summary' => $this->summary($results),
            'results' => $results,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $results
     * @return array<string, mixed>
     */
    private function summary(array $results): array
    {
        $matched = count(array_filter($results, static fn (array $row): bool => $row['status'] === 'matched'));
        $missing = count(array_filter($results, static fn (array $row): bool => $row['status'] === 'missing'));
        $mismatched = count(array_filter($results, static fn (array $row): bool => $row['status'] === 'mismatched'));
        $maxDelta = 0.0;

        foreach ($results as $row) {
            if (is_numeric($row['delta'])) {
                $maxDelta = max($maxDelta, abs((float) $row['delta']));
            }
        }

        return [
            'status' => ($missing === 0 && $mismatched === 0) ? 'pass' : 'fail',
            'matched' => $matched,
            'missing' => $missing,
            'mismatched' => $mismatched,
            'total' => count($results),
            'maxDelta' => $maxDelta,
        ];
    }

    /**
     * @param  array<string, mixed>  $fixture
     * @return array<int, array<string, mixed>>
     */
    private function fixtureLines(array $fixture): array
    {
        $lines = $fixture['lines'] ?? [];

        if (! is_array($lines)) {
            return [];
        }

        return array_values(array_filter($lines, static fn (mixed $line): bool => is_array($line)));
    }

    /**
     * @param  array<string, mixed>  $line
     */
    private function linePrecision(array $line): int
    {
        $precision = $line['precision'] ?? 0;

        return is_numeric($precision) ? max(0, (int) $precision) : 0;
    }

    /**
     * @param  array<string, mixed>  $line
     */
    private function lineTolerance(array $line, ?float $defaultTolerance): float
    {
        $tolerance = $line['tolerance'] ?? $defaultTolerance ?? 0.0;

        return is_numeric($tolerance) ? max(0.0, (float) $tolerance) : 0.0;
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function actualValue(array $facts, string $path): ?float
    {
        $direct = $this->numeric($this->valueAtPath($facts, $path));
        if ($direct !== null) {
            return $direct;
        }

        $derived = $this->derivedValue($facts, $path);
        if ($derived !== null) {
            return $derived;
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function derivedValue(array $facts, string $path): ?float
    {
        return match ($path) {
            'schedule1.line10TotalAdditionalIncome' => $this->sumActuals($facts, ['schedule1.line5Total', 'schedule1.line9TotalOtherIncome']),
            'form4952.line4cNetInvestmentIncomeAfterQualifiedDividends' => $this->differenceActuals($facts, 'form4952.grossInvestmentIncomeTotal', 'form4952.totalQualifiedDividends'),
            default => null,
        };
    }

    /**
     * @param  array<string, mixed>  $facts
     * @param  array<int, string>  $paths
     */
    private function sumActuals(array $facts, array $paths): ?float
    {
        $total = 0.0;

        foreach ($paths as $path) {
            $value = $this->numeric($this->valueAtPath($facts, $path));
            if ($value === null) {
                return null;
            }

            $total += $value;
        }

        return round($total, 2);
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function differenceActuals(array $facts, string $leftPath, string $rightPath): ?float
    {
        $left = $this->numeric($this->valueAtPath($facts, $leftPath));
        $right = $this->numeric($this->valueAtPath($facts, $rightPath));

        if ($left === null || $right === null) {
            return null;
        }

        return round($left - $right, 2);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function valueAtPath(array $data, string $path): mixed
    {
        if ($path === '') {
            return null;
        }

        $current = $data;

        foreach (explode('.', $path) as $segment) {
            if (! is_array($current) || ! array_key_exists($segment, $current)) {
                return null;
            }

            $current = $current[$segment];
        }

        return $current;
    }

    private function numeric(mixed $value): ?float
    {
        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }

        if (is_string($value) && is_numeric(str_replace(',', '', $value))) {
            return (float) str_replace(',', '', $value);
        }

        return null;
    }
}
