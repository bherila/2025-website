<?php

use App\Services\Finance\K1LegacyTransformer;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One-time data migration: tag legacy flat-format K-1 parsed_data records with
 * schemaVersion "1.0" and transform them to the canonical FK1StructuredData shape.
 *
 * Canonical (new) records produced by GenAiJobDispatcherService::coerceK1Args already
 * carry schemaVersion "2026.1" and are not touched.
 *
 * The original flat data is preserved under the `legacyFields` key so nothing is lost.
 * This migration is idempotent: records already carrying any schemaVersion are skipped.
 */
return new class extends Migration
{
    public function up(): void
    {
        $rows = DB::table('fin_tax_documents')
            ->where('form_type', 'k1')
            ->whereNotNull('parsed_data')
            ->get(['id', 'parsed_data']);

        foreach ($rows as $row) {
            $data = json_decode($row->parsed_data, true);

            if (! is_array($data) || isset($data['schemaVersion'])) {
                // Already canonical — skip.
                continue;
            }

            $transformed = K1LegacyTransformer::transform($data);

            DB::table('fin_tax_documents')
                ->where('id', $row->id)
                ->update(['parsed_data' => json_encode($transformed)]);
        }
    }

    public function down(): void
    {
        // Restore original flat data from the preserved legacyFields key.
        $rows = DB::table('fin_tax_documents')
            ->where('form_type', 'k1')
            ->whereNotNull('parsed_data')
            ->get(['id', 'parsed_data']);

        foreach ($rows as $row) {
            $data = json_decode($row->parsed_data, true);

            if (! is_array($data) || ($data['schemaVersion'] ?? null) !== '1.0') {
                continue;
            }

            if (isset($data['legacyFields']) && is_array($data['legacyFields'])) {
                DB::table('fin_tax_documents')
                    ->where('id', $row->id)
                    ->update(['parsed_data' => json_encode($data['legacyFields'])]);
            }
        }
    }
};
