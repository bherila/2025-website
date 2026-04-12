<?php

namespace App\Console\Commands\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\K1LegacyTransformer;

class FinanceK1MigrateCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:k1-migrate
        {--dry-run : Show what would be migrated without writing to the database}';

    protected $description = 'Migrate legacy flat-format K-1 parsed_data records to the canonical schemaVersion structure';

    public function handle(): int
    {
        if ($this->resolveUser() === null) {
            return 1;
        }

        $isDryRun = (bool) $this->option('dry-run');

        $docs = FileForTaxDocument::where('user_id', $this->userId())
            ->where('form_type', 'k1')
            ->whereNotNull('parsed_data')
            ->get();

        $migrated = 0;
        $skipped = 0;

        foreach ($docs as $doc) {
            // Read the raw JSON from the DB, bypassing the model's normalising getter
            // so we can accurately detect and migrate legacy records.
            $rawJson = $doc->getRawOriginal('parsed_data');
            $parsed = is_string($rawJson) ? json_decode($rawJson, true) : $rawJson;

            if (! is_array($parsed) || ! K1LegacyTransformer::isLegacy($parsed)) {
                $skipped++;

                continue;
            }

            $canonical = K1LegacyTransformer::transform($parsed);

            if (! $isDryRun) {
                $doc->update(['parsed_data' => $canonical]);
            }

            $entityName = $parsed['entity_name'] ?? '(unknown entity)';
            $taxYear = $doc->tax_year ?? '(unknown year)';
            $this->line("  [{$doc->id}] {$entityName} ({$taxYear})".($isDryRun ? ' [dry-run]' : ''));

            $migrated++;
        }

        $label = $isDryRun ? 'Would migrate' : 'Migrated';
        $this->info("{$label}: {$migrated} record(s).");
        $this->info("Skipped (already canonical): {$skipped}.");

        return 0;
    }
}
