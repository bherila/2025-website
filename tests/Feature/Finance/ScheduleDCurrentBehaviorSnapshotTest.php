<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Services\Finance\CapitalGains\CapitalGainsTaxReportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Set UPDATE_SCHEDULE_D_SNAPSHOTS=1 only when intentionally regenerating these
 * committed fixtures after reviewing the Schedule D/Form 8949 output diff.
 */
class ScheduleDCurrentBehaviorSnapshotTest extends TestCase
{
    use RefreshDatabase;

    public function test_schedule_d_and_form_8949_current_behavior_snapshots(): void
    {
        $snapshots = [
            'documented_broker_priority' => $this->documentedBrokerPriorityPayload(),
            'accepted_account_override' => $this->acceptedAccountOverridePayload(),
            'doc_12_wash_sale_adjustment' => $this->doc12WashSaleAdjustmentPayload(),
        ];

        foreach ($snapshots as $name => $payload) {
            $this->assertMatchesScheduleDSnapshot($name, $payload);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function documentedBrokerPriorityPayload(): array
    {
        $user = $this->createUser();
        $brokerage = $this->makeAccount((int) $user->id, 'Brokerage');
        $otherBrokerage = $this->makeAccount((int) $user->id, 'Other Brokerage');
        $document = $this->makeTaxDocument((int) $user->id);
        $this->makeLot($brokerage, [
            'symbol' => 'AAPL',
            'description' => 'Broker AAPL',
            'tax_document_id' => $document->id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'proceeds' => 1000,
            'cost_basis' => 900,
            'realized_gain_loss' => 100,
        ]);
        $this->makeLot($brokerage, [
            'symbol' => 'MSFT',
            'description' => 'Suppressed native same-account lot',
            'proceeds' => 9000,
            'cost_basis' => 8000,
            'realized_gain_loss' => 1000,
        ]);
        $this->makeLot($otherBrokerage, [
            'symbol' => 'TSLA',
            'description' => 'Native fallback other account',
            'proceeds' => 2000,
            'cost_basis' => 2500,
            'realized_gain_loss' => -500,
        ]);

        return $this->scheduleDPayload((int) $user->id);
    }

    /**
     * @return array<string, mixed>
     */
    private function doc12WashSaleAdjustmentPayload(): array
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id, 'Doc 12 Brokerage');
        $document = $this->makeTaxDocument((int) $user->id);
        $this->makeLot($account, [
            'symbol' => 'DOC12',
            'description' => 'Doc 12 broker lot',
            'tax_document_id' => $document->id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'proceeds' => 749840.20,
            'cost_basis' => 799409.88,
            'realized_gain_loss' => -49569.68,
            'form_8949_box' => 'D',
        ]);
        $this->makeLot($account, [
            'symbol' => 'WASHSALEADJ',
            'description' => 'Broker summary wash-sale adjustment (Form 8949 Box D)',
            'quantity' => 1,
            'purchase_date' => '2025-12-15',
            'sale_date' => '2025-12-15',
            'tax_document_id' => $document->id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT,
            'proceeds' => 0,
            'cost_basis' => 0,
            'realized_gain_loss' => 536.36,
            'wash_sale_disallowed' => 536.36,
            'form_8949_box' => 'D',
        ]);

        return $this->scheduleDPayload((int) $user->id);
    }

    /**
     * @return array<string, mixed>
     */
    private function acceptedAccountOverridePayload(): array
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id, 'Brokerage');
        $document = $this->makeTaxDocument((int) $user->id);
        $brokerLot = $this->makeLot($account, [
            'symbol' => 'AAPL',
            'description' => 'Broker AAPL',
            'tax_document_id' => $document->id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'proceeds' => 1000,
            'cost_basis' => 1100,
            'realized_gain_loss' => -100,
        ]);
        $accountLot = $this->makeLot($account, [
            'symbol' => 'AAPL',
            'description' => 'Accepted account AAPL',
            'proceeds' => 1000,
            'cost_basis' => 1200,
            'realized_gain_loss' => -200,
        ]);
        FinLotReconciliationLink::create([
            'tax_document_id' => $document->id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => $accountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
            'match_reason' => [
                'reason_code' => 'snapshot_fixture',
                'score' => 1.0,
                'deltas' => [
                    'proceeds' => 0.0,
                    'basis' => 100.0,
                    'wash' => 0.0,
                    'qty' => 0.0,
                    'date_days' => 0,
                ],
                'notes' => null,
            ],
            'accepted_by_user_id' => $user->id,
            'accepted_at' => now(),
        ]);
        $brokerLot->update([
            'superseded_by_lot_id' => $accountLot->lot_id,
            'reconciliation_status' => FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
        ]);
        $accountLot->update(['reconciliation_status' => FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE]);

        return $this->scheduleDPayload((int) $user->id);
    }

    /**
     * @return array<string, mixed>
     */
    private function scheduleDPayload(int $userId): array
    {
        $service = app(CapitalGainsTaxReportService::class);
        $report = $service->reportForUserYear($userId, 2025);

        return [
            'rows' => $service->rowsPayload($report['rows']),
            'scheduleDRollup' => $service->rollupPayload($report['scheduleDRollup']),
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function assertMatchesScheduleDSnapshot(string $name, array $payload): void
    {
        $path = base_path("tests/Fixtures/schedule_d_snapshots/{$name}.json");
        $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        $this->assertIsString($json);

        if (filter_var(getenv('UPDATE_SCHEDULE_D_SNAPSHOTS') ?: false, FILTER_VALIDATE_BOOLEAN)) {
            if (! is_dir(dirname($path))) {
                mkdir(dirname($path), 0777, true);
            }

            file_put_contents($path, $json.PHP_EOL);
        }

        $this->assertFileExists($path);
        $this->assertJsonStringEqualsJsonFile($path, $json);
    }

    private function makeAccount(int $userId, string $name): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate([
            'acct_owner' => $userId,
            'acct_name' => $name,
            'acct_last_balance' => '0',
        ]));
    }

    private function makeTaxDocument(int $userId): FileForTaxDocument
    {
        return FileForTaxDocument::create([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => 'broker-1099.pdf',
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
        return FinAccountLot::create(array_merge([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'sale_date' => '2025-02-03',
            'proceeds' => 1000,
            'cost_basis' => 900,
            'realized_gain_loss' => 100,
            'is_short_term' => false,
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'form_8949_box' => 'D',
            'is_covered' => true,
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }
}
