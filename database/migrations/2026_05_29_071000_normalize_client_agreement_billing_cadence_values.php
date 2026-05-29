<?php

use App\Enums\ClientManagement\BillingCadence;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

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
                    $normalized = $this->normalizeCadenceValue((string) $agreement->billing_cadence);

                    if ($normalized === $agreement->billing_cadence) {
                        continue;
                    }

                    if (BillingCadence::tryFrom($normalized) === null) {
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

    private function normalizeCadenceValue(string $value): string
    {
        $normalized = trim($value);

        if (
            (str_starts_with($normalized, '"') && str_ends_with($normalized, '"'))
            || (str_starts_with($normalized, '\'') && str_ends_with($normalized, '\''))
        ) {
            $normalized = substr($normalized, 1, -1);
        }

        return match (strtolower($normalized)) {
            'semiannual', 'semi-annual' => BillingCadence::SemiAnnual->value,
            default => $normalized,
        };
    }
};
