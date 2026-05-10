<?php

namespace Database\Factories\FinanceTool;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<FinLotReconciliationLink>
 */
class FinLotReconciliationLinkFactory extends Factory
{
    protected $model = FinLotReconciliationLink::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $user = null;
        $account = null;
        $taxDocument = null;

        $resolveUser = function () use (&$user): User {
            return $user ??= User::factory()->create();
        };
        $resolveAccount = function () use (&$account, $resolveUser): FinAccounts {
            return $account ??= $this->createAccount((int) $resolveUser()->id);
        };
        $resolveTaxDocument = function () use (&$taxDocument, $resolveUser): FileForTaxDocument {
            return $taxDocument ??= $this->createTaxDocument((int) $resolveUser()->id);
        };

        return [
            'tax_document_id' => fn (): int => $resolveTaxDocument()->id,
            'broker_lot_id' => fn (array $attributes): int => $this->createBrokerLot(
                $resolveAccount(),
                is_numeric($attributes['tax_document_id'] ?? null)
                    ? (int) $attributes['tax_document_id']
                    : $resolveTaxDocument()->id,
            )->lot_id,
            'account_lot_id' => fn (): int => $this->createAccountLot($resolveAccount())->lot_id,
            'state' => FinLotReconciliationLink::STATE_NEEDS_REVIEW,
            'match_reason' => [
                'reason_code' => 'factory_fixture',
                'score' => 0.98,
                'deltas' => [
                    'proceeds' => 10.0,
                    'basis' => 0.0,
                    'wash' => 0.0,
                    'qty' => 0.0,
                    'date_days' => 0,
                ],
                'notes' => null,
            ],
            'accepted_by_user_id' => fn (): int => $resolveUser()->id,
            'accepted_at' => now(),
        ];
    }

    private function createAccount(int $userId): FinAccounts
    {
        // Account model events require an auth context; fixture setup supplies acct_owner directly.
        return FinAccounts::withoutEvents(function () use ($userId): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => 'Factory Brokerage',
                'acct_last_balance' => '0',
            ]);
        });
    }

    private function createTaxDocument(int $userId): FileForTaxDocument
    {
        return FileForTaxDocument::create([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => fake()->unique()->slug().'.pdf',
            'stored_filename' => fake()->uuid().'.pdf',
            's3_path' => 'tax_docs/'.$userId.'/'.fake()->uuid().'.pdf',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createBrokerLot(FinAccounts $account, int $taxDocumentId, array $overrides = []): FinAccountLot
    {
        return $this->createLot($account, array_merge([
            'tax_document_id' => $taxDocumentId,
            'lot_source' => '1099b',
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ], $overrides));
    }

    private function createAccountLot(FinAccounts $account): FinAccountLot
    {
        return $this->createLot($account, [
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'proceeds' => 1260,
            'realized_gain_loss' => 260,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        return FinAccountLot::create(array_merge([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'cost_basis' => 1000,
            'cost_per_unit' => 100,
            'sale_date' => '2025-02-03',
            'proceeds' => 1250,
            'realized_gain_loss' => 250,
            'is_short_term' => false,
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
        ], $overrides));
    }
}
