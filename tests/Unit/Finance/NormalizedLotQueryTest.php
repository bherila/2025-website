<?php

namespace Tests\Unit\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Services\Finance\CapitalGains\NormalizedLotQuery;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NormalizedLotQueryTest extends TestCase
{
    use RefreshDatabase;

    public function test_for_user_year_prefers_broker_lots_over_unreviewed_account_lots(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);
        $document = $this->makeTaxDocument((int) $user->id);

        $brokerLot = $this->makeLot($account, [
            'tax_document_id' => $document->id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);
        $this->makeLot($account, [
            'description' => 'Unreviewed account duplicate',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
        ]);

        $this->assertSame(
            [$brokerLot->lot_id],
            $this->lotIds(NormalizedLotQuery::forUserYear((int) $user->id, 2025)),
        );
    }

    public function test_accepted_account_override_uses_account_lot_and_suppresses_broker_lot(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);
        $document = $this->makeTaxDocument((int) $user->id);
        $brokerLot = $this->makeLot($account, [
            'tax_document_id' => $document->id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'cost_basis' => 1100,
        ]);
        $accountLot = $this->makeLot($account, [
            'description' => 'Accepted account override',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'cost_basis' => 1200,
        ]);
        $this->makeLink($document, $brokerLot, $accountLot, FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE);
        $brokerLot->update([
            'superseded_by_lot_id' => $accountLot->lot_id,
            'reconciliation_status' => FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
        ]);
        $accountLot->update(['reconciliation_status' => FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE]);

        $this->assertSame(
            [$accountLot->lot_id],
            $this->lotIds(NormalizedLotQuery::forUserYear((int) $user->id, 2025)),
        );
    }

    public function test_accepted_broker_keeps_broker_lot_as_default(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);
        $document = $this->makeTaxDocument((int) $user->id);
        $brokerLot = $this->makeLot($account, [
            'tax_document_id' => $document->id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);
        $accountLot = $this->makeLot($account, [
            'description' => 'Accepted broker account-side lot',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
        ]);
        $this->makeLink($document, $brokerLot, $accountLot, FinLotReconciliationLink::STATE_ACCEPTED_BROKER);
        $brokerLot->update(['reconciliation_status' => FinLotReconciliationLink::STATE_ACCEPTED_BROKER]);
        $accountLot->update(['reconciliation_status' => FinLotReconciliationLink::STATE_ACCEPTED_BROKER]);

        $this->assertSame(
            [$brokerLot->lot_id],
            $this->lotIds(NormalizedLotQuery::forUserYear((int) $user->id, 2025)),
        );
    }

    public function test_ignored_duplicate_account_only_lot_stays_out_of_schedule_d(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);
        $document = $this->makeTaxDocument((int) $user->id);
        $brokerLot = $this->makeLot($account, [
            'tax_document_id' => $document->id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);
        $accountLot = $this->makeLot($account, [
            'description' => 'Ignored account duplicate',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
        ]);
        $this->makeLink($document, null, $accountLot, FinLotReconciliationLink::STATE_IGNORED_DUPLICATE);
        $accountLot->update(['reconciliation_status' => FinLotReconciliationLink::STATE_IGNORED_DUPLICATE]);

        $this->assertSame(
            [$brokerLot->lot_id],
            $this->lotIds(NormalizedLotQuery::forUserYear((int) $user->id, 2025)),
        );
    }

    public function test_unlinked_broker_manual_and_synthetic_lots_flow_through(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);
        $document = $this->makeTaxDocument((int) $user->id);
        $brokerLot = $this->makeLot($account, [
            'symbol' => 'AAPL',
            'tax_document_id' => $document->id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'reconciliation_status' => FinLotReconciliationLink::STATE_UNLINKED,
        ]);
        $this->makeLink($document, $brokerLot, null, FinLotReconciliationLink::STATE_UNLINKED);
        $manualLot = $this->makeLot($account, [
            'symbol' => 'MANUAL',
            'description' => 'Manual correction',
            'source' => FinAccountLot::SOURCE_MANUAL,
        ]);
        $syntheticLot = $this->makeLot($account, [
            'symbol' => 'WASHSALEADJ',
            'description' => 'Synthetic wash adjustment',
            'tax_document_id' => $document->id,
            'source' => FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT,
        ]);

        $this->assertSame(
            [$brokerLot->lot_id, $manualLot->lot_id, $syntheticLot->lot_id],
            $this->lotIds(NormalizedLotQuery::forUserYear((int) $user->id, 2025)),
        );
    }

    public function test_for_tax_document_includes_override_lot_even_when_sale_date_differs(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);
        $document = $this->makeTaxDocument((int) $user->id);
        $brokerLot = $this->makeLot($account, [
            'tax_document_id' => $document->id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'sale_date' => '2025-02-03',
        ]);
        $accountLot = $this->makeLot($account, [
            'description' => 'Account override with corrected date',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'sale_date' => '2025-02-04',
        ]);
        $this->makeLink($document, $brokerLot, $accountLot, FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE);
        $brokerLot->update([
            'superseded_by_lot_id' => $accountLot->lot_id,
            'reconciliation_status' => FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
        ]);
        $accountLot->update(['reconciliation_status' => FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE]);

        $this->assertSame(
            [$accountLot->lot_id],
            $this->lotIds(NormalizedLotQuery::forTaxDocument((int) $document->id)),
        );
    }

    /**
     * @return int[]
     */
    private function lotIds(Builder $query): array
    {
        return $query
            ->orderBy('lot_id')
            ->pluck('lot_id')
            ->map(static fn (int|string $lotId): int => (int) $lotId)
            ->all();
    }

    private function makeAccount(int $userId, string $name = 'Brokerage'): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate([
            'acct_owner' => $userId,
            'acct_name' => $name.' '.fake()->unique()->numerify('####'),
            'acct_last_balance' => '0',
        ]));
    }

    private function makeTaxDocument(int $userId): FileForTaxDocument
    {
        return FileForTaxDocument::create([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => fake()->unique()->slug().'.pdf',
            'stored_filename' => fake()->uuid().'.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
            'parsed_data' => [],
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        $proceeds = (float) ($overrides['proceeds'] ?? 1000);
        $costBasis = (float) ($overrides['cost_basis'] ?? 900);

        return FinAccountLot::create(array_merge([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'sale_date' => '2025-02-03',
            'proceeds' => $proceeds,
            'cost_basis' => $costBasis,
            'realized_gain_loss' => $proceeds - $costBasis,
            'is_short_term' => false,
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'form_8949_box' => 'D',
            'is_covered' => true,
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }

    private function makeLink(
        FileForTaxDocument $document,
        ?FinAccountLot $brokerLot,
        ?FinAccountLot $accountLot,
        string $state,
    ): FinLotReconciliationLink {
        return FinLotReconciliationLink::create([
            'tax_document_id' => $document->id,
            'broker_lot_id' => $brokerLot?->lot_id,
            'account_lot_id' => $accountLot?->lot_id,
            'state' => $state,
            'match_reason' => [
                'reason_code' => 'test_fixture',
                'score' => 1.0,
                'deltas' => [
                    'proceeds' => 0.0,
                    'basis' => 0.0,
                    'wash' => 0.0,
                    'qty' => 0.0,
                    'date_days' => 0,
                ],
                'notes' => null,
            ],
        ]);
    }
}
