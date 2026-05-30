<?php

use App\Casts\ClientManagement\BillingCadenceCast;
use App\Enums\ClientManagement\BillingCadence;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::table('client_agreements')
            ->select('id', 'billing_cadence')
            ->whereNotNull('billing_cadence')
            ->orderBy('id')
            ->chunkById(500, function ($agreements): void {
                foreach ($agreements as $agreement) {
                    $normalized = BillingCadenceCast::normalizeCadenceValue((string) $agreement->billing_cadence);

                    if ($normalized === $agreement->billing_cadence) {
                        continue;
                    }

                    if (BillingCadence::tryFrom($normalized) === null) {
                        Log::warning('normalize_billing_cadence migration: unrecognised value, skipping', [
                            'agreement_id' => $agreement->id,
                            'raw_value' => $agreement->billing_cadence,
                            'normalized' => $normalized,
                        ]);

                        continue;
                    }

                    DB::table('client_agreements')
                        ->where('id', $agreement->id)
                        ->update(['billing_cadence' => $normalized]);
                }
            }, 'id');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void {}
};
