<?php

namespace App\Console\Commands\Finance;

use App\Models\FinanceTool\FinAccountLot;

/**
 * Backfill the canonical `source` column for rows where it is null or default,
 * mapped from `lot_source` + `lot_origin`. Idempotent; works on MySQL and SQLite.
 *
 * Step 1 of the lot_source retirement pipeline.
 */
class FinanceBackfillLotSourceCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:backfill-lot-source
        {--dry-run : Preview updates without writing changes}
        {--apply : Actually write the changes (required for safety)}
        {--format=table : Output format: table or json}';

    protected $description = 'Backfill fin_account_lots.source from lot_source + lot_origin for rows where source is null or default.';

    public function handle(): int
    {
        if (! $this->validateFormat(['table', 'json'])) {
            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $apply = (bool) $this->option('apply');

        if (! $dryRun && ! $apply) {
            $this->error('You must pass either --dry-run or --apply.');

            return self::FAILURE;
        }

        if ($dryRun && $apply) {
            $this->error('Cannot use both --dry-run and --apply simultaneously.');

            return self::FAILURE;
        }

        $mappings = $this->buildMappings();
        $results = [];

        foreach ($mappings as $mapping) {
            $query = FinAccountLot::query()
                ->where(function ($q) use ($mapping): void {
                    if (array_key_exists('lot_source', $mapping)) {
                        if ($mapping['lot_source'] !== null) {
                            $q->where('lot_source', $mapping['lot_source']);
                        } else {
                            $q->whereNull('lot_source');
                        }
                    }

                    if ($mapping['lot_origin'] !== null) {
                        $q->where('lot_origin', $mapping['lot_origin']);
                    }
                })
                ->where(function ($q) use ($mapping): void {
                    $q->whereNull('source');

                    if ($mapping['target_source'] !== FinAccountLot::SOURCE_ACCOUNT_DERIVED) {
                        $q->orWhere('source', FinAccountLot::SOURCE_ACCOUNT_DERIVED);
                    }
                });

            $count = $query->count();

            if ($count > 0 && $apply) {
                $query->update(['source' => $mapping['target_source']]);
            }

            $results[] = [
                'lot_source' => array_key_exists('lot_source', $mapping) ? ($mapping['lot_source'] ?? '(null)') : '(any)',
                'lot_origin' => $mapping['lot_origin'] ?? '(any)',
                'target_source' => $mapping['target_source'],
                'rows_affected' => $count,
                'applied' => $apply && $count > 0 ? 'yes' : 'no',
            ];
        }

        $totalAffected = array_sum(array_column($results, 'rows_affected'));

        if (($this->option('format') ?? 'table') === 'json') {
            $this->line(json_encode([
                'dry_run' => $dryRun,
                'total_affected' => $totalAffected,
                'mappings' => $results,
            ], JSON_PRETTY_PRINT));
        } else {
            $this->table(
                ['lot_source', 'lot_origin', 'target_source', 'rows_affected', 'applied'],
                $results,
            );
            $this->info(($dryRun ? '[DRY RUN] ' : '')."Total rows affected: {$totalAffected}");
        }

        return self::SUCCESS;
    }

    /**
     * Build the mapping rules from legacy lot_source/lot_origin to canonical source.
     *
     * @return array<int, array{lot_source?: string|null, lot_origin: string|null, target_source: string}>
     */
    private function buildMappings(): array
    {
        return [
            // 1099b → broker_1099b
            [
                'lot_source' => FinAccountLot::SOURCE_1099B,
                'lot_origin' => null,
                'target_source' => FinAccountLot::SOURCE_BROKER_1099B,
            ],
            // 1099_b → broker_1099b
            [
                'lot_source' => FinAccountLot::SOURCE_1099B_UNDERSCORE,
                'lot_origin' => null,
                'target_source' => FinAccountLot::SOURCE_BROKER_1099B,
            ],
            // Rows with 1099b_disposition origin → broker_1099b
            [
                'lot_origin' => FinAccountLot::ORIGIN_1099B_DISPOSITION,
                'target_source' => FinAccountLot::SOURCE_BROKER_1099B,
            ],
            // statement_disposition → account_derived
            [
                'lot_origin' => FinAccountLot::ORIGIN_STATEMENT_DISPOSITION,
                'target_source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            ],
            // statement_position → account_derived
            [
                'lot_origin' => FinAccountLot::ORIGIN_STATEMENT_POSITION,
                'target_source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            ],
            // csv_import → account_derived
            [
                'lot_origin' => FinAccountLot::ORIGIN_CSV_IMPORT,
                'target_source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            ],
            // manual origin → manual source
            [
                'lot_origin' => FinAccountLot::ORIGIN_MANUAL,
                'target_source' => FinAccountLot::SOURCE_MANUAL,
            ],
        ];
    }
}
