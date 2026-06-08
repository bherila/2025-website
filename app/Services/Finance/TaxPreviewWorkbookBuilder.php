<?php

namespace App\Services\Finance;

class TaxPreviewWorkbookBuilder
{
    private const array SHEET_NAMES = [
        'form1040' => 'Form 1040',
        'schedule1' => 'Schedule 1',
        'schedule3' => 'Schedule 3',
        'scheduleA' => 'Schedule A',
        'scheduleB' => 'Schedule B',
        'scheduleC' => 'Schedule C',
        'scheduleD' => 'Schedule D',
        'scheduleE' => 'Schedule E',
        'scheduleF' => 'Schedule F',
        'scheduleSE' => 'Schedule SE',
        'form1116' => 'Form 1116',
        'form4797' => 'Form 4797',
        'form4952' => 'Form 4952',
        'form8959' => 'Form 8959',
        'form6251' => 'Form 6251',
        'form8582' => 'Form 8582',
        'form8606' => 'Form 8606',
        'form8949' => 'Form 8949',
        'form8960' => 'Form 8960',
        'form8995' => 'Form 8995',
        'partnershipBasis' => 'Partnership Basis',
    ];

    private const array SUMMARY_ROWS = [
        'form1040.line9' => 'Form 1040 line 9 - total income',
        'form1040.line11' => 'Form 1040 line 11 - adjusted gross income',
        'form1040.line15' => 'Form 1040 line 15 - taxable income',
        'form1040.line16' => 'Form 1040 line 16 - tax',
        'form1040.line24' => 'Form 1040 line 24 - total tax',
        'form1040.line25d' => 'Form 1040 line 25d - total withholding',
        'form1040.line33' => 'Form 1040 line 33 - total payments',
        'form1040.line34' => 'Form 1040 line 34 - overpayment',
        'form1040.line37' => 'Form 1040 line 37 - amount owed',
        'scheduleB.interestTotal' => 'Schedule B interest',
        'scheduleB.ordinaryDividendTotal' => 'Schedule B ordinary dividends',
        'scheduleD.line16Combined' => 'Schedule D net capital gain or loss',
        'scheduleSE.seTax' => 'Schedule SE tax',
        'form8959.additionalTax' => 'Form 8959 Additional Medicare Tax',
        'form6251.amt' => 'Form 6251 alternative minimum tax',
        'form8995.deduction' => 'Form 8995 QBI deduction',
    ];

    private const array TOTAL_FACT_PATHS = [
        'form1040.line9',
        'form1040.line11',
        'form1040.line15',
        'form1040.line16',
        'form1040.line21',
        'form1040.line24',
        'form1040.line25d',
        'form1040.line33',
        'form1040.line34',
        'form1040.line37',
    ];

    public function __construct(
        private readonly TaxPreviewFactsService $taxPreviewFactsService,
    ) {}

    /**
     * @return array{filename: string, sheets: array<int, array{name: string, rows: array<int, array<string, mixed>>}>}
     */
    public function buildForUserYear(int $userId, int $year, ?string $filename = null): array
    {
        $facts = $this->taxPreviewFactsService->arrayForYear($userId, $year);
        $sheets = [$this->overviewSheet($facts)];

        foreach (self::SHEET_NAMES as $key => $name) {
            $slice = $facts[$key] ?? null;
            if (is_array($slice)) {
                if ($key === 'partnershipBasis') {
                    array_push($sheets, ...$this->partnershipBasisSheets($slice));
                } else {
                    $sheets[] = $this->factSheet($name, $slice);
                }
            }
        }

        return [
            'filename' => $this->filename($filename, $year),
            'sheets' => $sheets,
        ];
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array<int, array{name: string, rows: array<int, array<string, mixed>>}>
     */
    private function partnershipBasisSheets(array $facts): array
    {
        $interests = is_array($facts['interests'] ?? null) ? $facts['interests'] : [];

        return [
            ['name' => 'Partnership Basis Summary', 'rows' => $this->partnershipBasisSummaryRows($interests)],
            ['name' => 'Outside Basis Rollforward', 'rows' => $this->partnershipBasisWorksheetRows($interests)],
            ['name' => 'Inside Basis / Capital Reconciliation', 'rows' => $this->partnershipBasisCapitalRows($interests)],
            ['name' => 'Distribution & Liquidation Analysis', 'rows' => $this->partnershipBasisDistributionRows($interests)],
            ['name' => 'Basis Source Lines', 'rows' => $this->partnershipBasisSourceRows($interests)],
        ];
    }

    /** @param array<int, mixed> $interests */
    private function partnershipBasisSummaryRows(array $interests): array
    {
        $rows = [['description' => 'Partnership basis summary', 'isHeader' => true]];
        foreach ($interests as $interest) {
            if (! is_array($interest)) {
                continue;
            }
            $worksheet = is_array($interest['worksheet'] ?? null) ? $interest['worksheet'] : [];
            $rows[] = [
                'description' => (string) ($interest['partnershipName'] ?? 'Partnership'),
                'amount' => $this->numericAtPath(['worksheet' => $worksheet], 'worksheet.endingOutsideBasis') ?? 0.0,
                'note' => (string) ($interest['reviewStatus'] ?? 'needs_review'),
                'isTotal' => true,
            ];
        }

        return $rows;
    }

    /** @param array<int, mixed> $interests */
    private function partnershipBasisWorksheetRows(array $interests): array
    {
        $rows = [['description' => 'Outside basis rollforward', 'isHeader' => true]];
        foreach ($interests as $interest) {
            if (! is_array($interest) || ! is_array($interest['worksheet'] ?? null)) {
                continue;
            }
            $rows[] = ['description' => (string) ($interest['partnershipName'] ?? 'Partnership'), 'isHeader' => true];
            $this->appendScalarRows($rows, $interest['worksheet']);
        }

        return $rows;
    }

    /** @param array<int, mixed> $interests */
    private function partnershipBasisCapitalRows(array $interests): array
    {
        $rows = [['description' => 'Inside basis / capital reconciliation', 'isHeader' => true]];
        foreach ($interests as $interest) {
            if (! is_array($interest)) {
                continue;
            }
            $rows[] = ['description' => (string) ($interest['partnershipName'] ?? 'Partnership'), 'isHeader' => true];
            foreach (['beginningTaxBasisCapital', 'endingTaxBasisCapital', 'beginningBookCapital', 'endingBookCapital', 'insideBasisConfidence'] as $key) {
                $value = $interest[$key] ?? null;
                $rows[] = is_numeric($value)
                    ? ['line' => $key, 'description' => $this->humanizePath($key), 'amount' => (float) $value]
                    : ['line' => $key, 'description' => $this->humanizePath($key), 'note' => $this->stringValue($value)];
            }
        }

        return $rows;
    }

    /** @param array<int, mixed> $interests */
    private function partnershipBasisDistributionRows(array $interests): array
    {
        $rows = [['description' => 'Distribution & liquidation analysis', 'isHeader' => true]];
        foreach ($interests as $interest) {
            if (! is_array($interest) || ! is_array($interest['worksheet'] ?? null)) {
                continue;
            }
            $worksheet = $interest['worksheet'];
            $rows[] = ['description' => (string) ($interest['partnershipName'] ?? 'Partnership'), 'isHeader' => true];
            foreach (['cashDistributions', 'propertyDistributionsBasis', 'distributionGain', 'liquidationGainLoss', 'suspendedLossCarryforward'] as $key) {
                $value = $worksheet[$key] ?? null;
                if ($value !== null) {
                    $rows[] = ['line' => $key, 'description' => $this->humanizePath($key), 'amount' => (float) $value];
                }
            }
        }

        return $rows;
    }

    /** @param array<int, mixed> $interests */
    private function partnershipBasisSourceRows(array $interests): array
    {
        $rows = [['description' => 'Basis source lines', 'isHeader' => true]];
        foreach ($interests as $interest) {
            if (! is_array($interest) || ! is_array($interest['events'] ?? null)) {
                continue;
            }
            foreach ($interest['events'] as $event) {
                if (! is_array($event)) {
                    continue;
                }
                $rows[] = [
                    'line' => (string) ($event['sourcePath'] ?? $event['eventType'] ?? ''),
                    'description' => (string) ($event['sourceLabel'] ?? $event['eventType'] ?? 'Basis event'),
                    'amount' => is_numeric($event['amount'] ?? null) ? (float) $event['amount'] : 0.0,
                    'note' => trim(implode(' ', array_filter([
                        $event['sourceType'] ?? null,
                        isset($event['taxDocumentId']) ? 'tax_document#'.$event['taxDocumentId'] : null,
                        $event['reviewStatus'] ?? null,
                    ], 'is_string'))),
                ];
            }
        }

        return $rows;
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array{name: string, rows: array<int, array<string, mixed>>}
     */
    private function overviewSheet(array $facts): array
    {
        $rows = [
            ['description' => 'Backend tax facts summary', 'isHeader' => true],
        ];

        foreach (self::SUMMARY_ROWS as $path => $description) {
            $amount = $this->numericAtPath($facts, $path);
            if ($amount === null) {
                continue;
            }

            $rows[] = [
                'line' => $this->lineFromPath($path),
                'description' => $description,
                'amount' => $amount,
                'isTotal' => str_contains(strtolower($description), 'total'),
            ];
        }

        return ['name' => 'Overview', 'rows' => $rows];
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array{name: string, rows: array<int, array<string, mixed>>}
     */
    private function factSheet(string $name, array $facts): array
    {
        $rows = [
            ['description' => 'Computed values', 'isHeader' => true],
        ];

        $this->appendScalarRows($rows, $facts);
        $sourceGroups = $this->sourceGroups($facts);

        foreach ($sourceGroups as $path => $sources) {
            $rows[] = ['description' => $this->humanizePath($path), 'isHeader' => true];

            foreach ($sources as $source) {
                $rows[] = $this->sourceRow($path, $source);
            }
        }

        return ['name' => $name, 'rows' => $rows];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @param  array<mixed>  $data
     */
    private function appendScalarRows(array &$rows, array $data, string $prefix = ''): void
    {
        foreach ($data as $key => $value) {
            $path = $prefix === '' ? (string) $key : "{$prefix}.{$key}";

            if (is_array($value)) {
                if ($this->taxFactSourceRows($value) !== null) {
                    continue;
                }

                $this->appendNestedRows($rows, $value, $path);

                continue;
            }

            if ($value === null) {
                continue;
            }

            $row = [
                'line' => $this->lineFromPath($path),
                'description' => $this->humanizePath($path),
            ];

            if (is_int($value) || is_float($value)) {
                $row['amount'] = (float) $value;
                if ($this->isTotalPath($path)) {
                    $row['isTotal'] = true;
                }
            } elseif (is_bool($value)) {
                $row['note'] = $value ? 'Yes' : 'No';
            } else {
                $row['note'] = (string) $value;
            }

            $rows[] = $row;
        }
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @param  array<mixed>  $value
     */
    private function appendNestedRows(array &$rows, array $value, string $path): void
    {
        if ($value === []) {
            return;
        }

        if (array_is_list($value)) {
            foreach ($value as $index => $item) {
                if (is_array($item)) {
                    $this->appendScalarRows($rows, $item, $path.'.'.($index + 1));
                } elseif ($item !== null) {
                    $rows[] = [
                        'line' => $path.'.'.($index + 1),
                        'description' => $this->humanizePath($path.'.'.($index + 1)),
                        'note' => $this->stringValue($item),
                    ];
                }
            }

            return;
        }

        $this->appendScalarRows($rows, $value, $path);
    }

    /**
     * @param  array<mixed>  $data
     * @return array<string, array<int, array<string, mixed>>>
     */
    private function sourceGroups(array $data, string $prefix = ''): array
    {
        $sourceGroups = [];

        foreach ($data as $key => $value) {
            $path = $prefix === '' ? (string) $key : "{$prefix}.{$key}";

            if (! is_array($value)) {
                continue;
            }

            $sourceRows = $this->taxFactSourceRows($value);
            if ($sourceRows !== null) {
                $sourceGroups[$path] = $sourceRows;

                continue;
            }

            if (array_is_list($value)) {
                foreach ($value as $index => $item) {
                    if (is_array($item)) {
                        $sourceGroups = array_merge($sourceGroups, $this->sourceGroups($item, $path.'.'.($index + 1)));
                    }
                }

                continue;
            }

            $sourceGroups = array_merge($sourceGroups, $this->sourceGroups($value, $path));
        }

        return $sourceGroups;
    }

    /**
     * @param  array<mixed>  $value
     * @return array<int, array<string, mixed>>|null
     */
    private function taxFactSourceRows(array $value): ?array
    {
        if ($value === []) {
            return null;
        }

        $sources = [];
        foreach ($value as $source) {
            if (! is_array($source)
                || ! array_key_exists('label', $source)
                || ! array_key_exists('amount', $source)
                || ! array_key_exists('sourceType', $source)) {
                return null;
            }

            $sources[] = $source;
        }

        return $sources;
    }

    /**
     * @param  array<string, mixed>  $source
     * @return array<string, mixed>
     */
    private function sourceRow(string $path, array $source): array
    {
        $noteParts = [];
        foreach (['sourceType', 'routing', 'routingReason', 'formType', 'box', 'code', 'reviewStatus', 'reviewAction', 'notes'] as $key) {
            if (! empty($source[$key])) {
                $noteParts[] = $this->humanizePath($key).': '.$this->stringValue($source[$key]);
            }
        }

        foreach (['taxDocumentId', 'taxDocumentAccountId', 'accountId'] as $key) {
            if (isset($source[$key])) {
                $noteParts[] = $this->humanizePath($key).': '.$this->stringValue($source[$key]);
            }
        }

        return [
            'line' => $this->lineFromPath($path),
            'description' => $this->stringValue($source['label'] ?? $path),
            'amount' => (float) ($source['amount'] ?? 0),
            'note' => implode(' | ', $noteParts),
        ];
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function numericAtPath(array $facts, string $path): ?float
    {
        $cursor = $facts;
        foreach (explode('.', $path) as $segment) {
            if (! is_array($cursor) || ! array_key_exists($segment, $cursor)) {
                return null;
            }

            $cursor = $cursor[$segment];
        }

        return is_int($cursor) || is_float($cursor) ? (float) $cursor : null;
    }

    private function filename(?string $filename, int $year): string
    {
        $filename = trim((string) $filename);

        return $filename !== '' ? $filename : "tax-preview-{$year}.xlsx";
    }

    private function humanizePath(string $path): string
    {
        $label = preg_replace('/([a-z])([A-Z])/', '$1 $2', $path) ?? $path;
        $label = str_replace(['_', '.'], ' ', $label);
        $label = preg_replace('/\s+/', ' ', $label) ?? $label;

        return ucfirst(trim($label));
    }

    private function lineFromPath(string $path): string
    {
        $parts = explode('.', $path);
        $last = $parts[count($parts) - 1];

        if (preg_match('/^line([0-9]+[a-z]?)$/i', $last, $matches) === 1) {
            return $matches[1];
        }

        if (preg_match('/^line([0-9]+[a-z]?)[A-Z_]/', $last, $matches) === 1) {
            return $matches[1];
        }

        return $last;
    }

    private function isTotalPath(string $path): bool
    {
        if (in_array($path, self::TOTAL_FACT_PATHS, true)) {
            return true;
        }

        $last = $this->lastPathSegment($path);

        return preg_match('/(Total|Tax)$/', $last) === 1
            || in_array($last, ['grandTotal', 'amt', 'deduction'], true);
    }

    private function lastPathSegment(string $path): string
    {
        $parts = explode('.', $path);

        return $parts[count($parts) - 1];
    }

    private function stringValue(mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? 'Yes' : 'No';
        }

        if (is_scalar($value) || $value === null) {
            return (string) $value;
        }

        return json_encode($value) ?: '';
    }
}
