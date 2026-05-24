<?php

namespace App\Console\Commands\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Backfill per-lot wash_sale_disallowed amounts from stored parsed 1099-B
 * transaction rows.
 *
 * Some historical broker_1099 documents were imported before the parser
 * surfaced the per-row wash_sale_loss_disallowed field. Their fin_account_lots
 * rows have wash_sale_disallowed=0 even though the source parsed_data carries
 * the §1091 disallowed amount required for Form 8949 column (g).
 *
 * The command scans each broker_1099 document for the target user/year, walks
 * its parsed_data[*].parsed_data.transactions[] rows, and updates matching
 * lots by (document_id, disposed_date, description, quantity). The operation
 * is idempotent: lots already carrying the correct amount are skipped.
 */
class FinanceBackfillWashSaleCommand extends BaseFinanceCommand
{
    private const float MONEY_TOLERANCE = 0.02;

    protected $signature = 'finance:backfill-wash-sale
        {--user= : User ID; defaults to FINANCE_CLI_USER_ID or 1}
        {--year= : Tax year; defaults to current year}
        {--dry-run : Preview lot updates without writing changes}
        {--format=table : Output format: table or json}';

    protected $description = 'Backfill fin_account_lots.wash_sale_disallowed from stored parsed 1099-B rows.';

    public function handle(): int
    {
        if (! $this->validateFormat(['table', 'json'])) {
            return self::FAILURE;
        }

        $userId = (int) ($this->option('user') ?: $this->userId());
        if (! User::query()->whereKey($userId)->exists()) {
            $this->error("User ID {$userId} not found. Pass --user for a valid user or set FINANCE_CLI_USER_ID.");

            return self::FAILURE;
        }

        $year = (int) ($this->option('year') ?: date('Y'));
        if ($year < 1900 || $year > 2100) {
            $this->error('--year must be between 1900 and 2100.');

            return self::FAILURE;
        }

        $isDryRun = (bool) $this->option('dry-run');
        $documents = $this->brokerDocuments($userId, $year);
        $results = [];

        foreach ($documents as $document) {
            $documentId = (int) $document->document_id;
            $rowsByKey = $this->washSaleRowsByKey($document);
            if ($rowsByKey === []) {
                continue;
            }

            $updates = $this->backfillDocument($documentId, $rowsByKey, $isDryRun);
            if ($updates === []) {
                continue;
            }

            $results[] = [
                'taxDocumentId' => (int) $document->id,
                'documentId' => $documentId,
                'taxYear' => (int) $document->tax_year,
                'filename' => (string) $document->original_filename,
                'updatedCount' => count($updates),
                'totalWashSale' => round(array_sum(array_column($updates, 'wash_sale_disallowed')), 4),
            ];
        }

        $payload = [
            'dryRun' => $isDryRun,
            'userId' => $userId,
            'year' => $year,
            'documentCount' => count($results),
            'totals' => [
                'updatedCount' => array_sum(array_column($results, 'updatedCount')),
                'totalWashSale' => round(array_sum(array_column($results, 'totalWashSale')), 4),
            ],
            'results' => $results,
        ];

        if (($this->option('format') ?? 'table') === 'json') {
            $this->outputJson($payload);

            return self::SUCCESS;
        }

        $this->renderTable(
            ['Doc ID', 'Year', 'Filename', 'Updated', 'Wash Sale Total'],
            array_map(
                static fn (array $result): array => [
                    $result['taxDocumentId'],
                    $result['taxYear'],
                    mb_strimwidth((string) $result['filename'], 0, 42, '...'),
                    $result['updatedCount'],
                    number_format((float) $result['totalWashSale'], 2),
                ],
                $results,
            ),
        );

        if ($isDryRun) {
            $this->line('Dry-run mode: no changes written.');
        }

        return self::SUCCESS;
    }

    /**
     * @return Collection<int, FileForTaxDocument>
     */
    private function brokerDocuments(int $userId, int $year): Collection
    {
        return FileForTaxDocument::query()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->where(function (Builder $query): void {
                $query->whereIn('form_type', [FileForTaxDocument::FORM_TYPE_1099_B, 'broker_1099'])
                    ->orWhereHas('accountLinks', function (Builder $linkQuery): void {
                        $linkQuery->where('form_type', FileForTaxDocument::FORM_TYPE_1099_B);
                    });
            })
            ->orderBy('id')
            ->get();
    }

    /**
     * Build a map keyed by (disposed_date|description|quantity) -> wash-sale amount.
     *
     * @return array<string, float>
     */
    private function washSaleRowsByKey(FileForTaxDocument $document): array
    {
        $data = $document->parsed_data;
        if (! is_array($data) || $data === []) {
            return [];
        }

        $entries = array_is_list($data) ? $data : [$data];
        $byKey = [];

        foreach ($entries as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $parsedData = $entry['parsed_data'] ?? $entry;
            if (! is_array($parsedData)) {
                continue;
            }

            $transactions = $parsedData['transactions'] ?? null;
            if (! is_array($transactions)) {
                continue;
            }

            foreach ($transactions as $row) {
                if (! is_array($row)) {
                    continue;
                }

                $amount = $this->rowWashSaleAmount($row);
                if ($amount === null || $amount <= self::MONEY_TOLERANCE) {
                    continue;
                }

                $key = $this->matchKey(
                    $this->normalizeDateOrNull($row['disposed_date'] ?? $row['sale_date'] ?? null),
                    is_string($row['description'] ?? null) ? trim($row['description']) : null,
                    is_numeric($row['quantity'] ?? null) ? (float) $row['quantity'] : null,
                );

                if ($key === null) {
                    continue;
                }

                $byKey[$key] = round(($byKey[$key] ?? 0.0) + $amount, 4);
            }
        }

        return $byKey;
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function rowWashSaleAmount(array $row): ?float
    {
        foreach (['wash_sale_loss_disallowed', 'wash_sale_disallowed'] as $key) {
            if (is_numeric($row[$key] ?? null)) {
                return abs((float) $row[$key]);
            }
        }

        return null;
    }

    /**
     * @param  array<string, float>  $rowsByKey
     * @return list<array{lot_id: int, wash_sale_disallowed: float}>
     */
    private function backfillDocument(int $documentId, array $rowsByKey, bool $isDryRun): array
    {
        $lots = FinAccountLot::query()
            ->where('document_id', $documentId)
            ->get();

        if ($lots->isEmpty()) {
            return [];
        }

        $updates = [];

        DB::transaction(function () use ($lots, $rowsByKey, $isDryRun, &$updates): void {
            foreach ($lots as $lot) {
                $key = $this->matchKey(
                    $lot->sale_date?->format('Y-m-d'),
                    is_string($lot->description) ? trim($lot->description) : null,
                    $lot->quantity !== null ? (float) $lot->quantity : null,
                );

                if ($key === null || ! isset($rowsByKey[$key])) {
                    continue;
                }

                $target = round($rowsByKey[$key], 4);
                $current = round((float) ($lot->wash_sale_disallowed ?? 0.0), 4);

                if (abs($target - $current) <= self::MONEY_TOLERANCE) {
                    continue;
                }

                if (! $isDryRun) {
                    $lot->wash_sale_disallowed = $target;
                    $lot->save();
                }

                $updates[] = [
                    'lot_id' => (int) $lot->lot_id,
                    'wash_sale_disallowed' => $target,
                ];
            }
        });

        return $updates;
    }

    private function matchKey(?string $disposedDate, ?string $description, ?float $quantity): ?string
    {
        if ($disposedDate === null || $description === null || $description === '' || $quantity === null) {
            return null;
        }

        return implode('|', [
            $disposedDate,
            strtolower($description),
            number_format($quantity, 8, '.', ''),
        ]);
    }

    private function normalizeDateOrNull(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '' || strtolower($trimmed) === 'various') {
            return null;
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed)) {
            return $trimmed;
        }

        try {
            return (new \DateTime($trimmed))->format('Y-m-d');
        } catch (\Throwable) {
            return null;
        }
    }
}
