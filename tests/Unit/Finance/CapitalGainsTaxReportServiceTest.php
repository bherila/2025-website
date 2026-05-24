<?php

namespace Tests\Unit\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Services\Finance\CapitalGains\CapitalGainsTaxReportService;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CapitalGainsTaxReportServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_documented_1099b_lots_take_priority_over_native_account_lots(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeTaxDocument($user->id);

        $this->makeLot($account, [
            'lot_source' => '1099b',
            'tax_document_id' => $document->id,
            'proceeds' => 125,
            'cost_basis' => 100,
        ]);
        $this->makeLot($account, [
            'lot_source' => 'analyzer',
            'tax_document_id' => null,
            'proceeds' => 1000,
            'cost_basis' => 100,
        ]);

        $report = app(CapitalGainsTaxReportService::class)->reportForUserYear($user->id, 2025);

        $this->assertSame(1, count($report['transactions']));
        $this->assertSame(25.0, $report['scheduleDRollup'][0]->netGainOrLoss);
    }

    public function test_documented_1099b_lots_suppress_native_lots_for_other_symbols_in_same_account_year(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeTaxDocument($user->id);

        $this->makeLot($account, [
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'lot_source' => '1099b',
            'tax_document_id' => $document->id,
            'proceeds' => 125,
            'cost_basis' => 100,
        ]);
        $this->makeLot($account, [
            'symbol' => 'MSFT',
            'description' => 'Microsoft Corp.',
            'lot_source' => 'analyzer',
            'tax_document_id' => null,
            'proceeds' => 1000,
            'cost_basis' => 100,
        ]);

        $report = app(CapitalGainsTaxReportService::class)->reportForUserYear($user->id, 2025);

        $this->assertSame(['AAPL'], array_map(
            static fn ($transaction): ?string => $transaction->symbol,
            $report['transactions'],
        ));
        $this->assertSame(25.0, $report['scheduleDRollup'][0]->netGainOrLoss);
    }

    public function test_documented_1099b_lots_only_suppress_native_lots_for_the_same_account(): void
    {
        $user = $this->createUser();
        $documentedAccount = $this->makeAccount($user->id);
        $nativeAccount = $this->makeAccount($user->id, 'Second Brokerage');
        $document = $this->makeTaxDocument($user->id);

        $this->makeLot($documentedAccount, [
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'lot_source' => '1099b',
            'tax_document_id' => $document->id,
            'proceeds' => 125,
            'cost_basis' => 100,
        ]);
        $this->makeLot($nativeAccount, [
            'symbol' => 'MSFT',
            'description' => 'Microsoft Corp.',
            'lot_source' => 'analyzer',
            'tax_document_id' => null,
            'proceeds' => 140,
            'cost_basis' => 100,
        ]);

        $report = app(CapitalGainsTaxReportService::class)->reportForUserYear($user->id, 2025);

        $this->assertSame(['AAPL', 'MSFT'], array_map(
            static fn ($transaction): ?string => $transaction->symbol,
            $report['transactions'],
        ));
        $this->assertSame(65.0, $report['scheduleDRollup'][0]->netGainOrLoss);
    }

    public function test_orphan_imported_1099b_lots_take_priority_over_native_account_lots(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        $this->makeLot($account, [
            'lot_source' => 'import_1099b',
            'tax_document_id' => null,
            'form_8949_box' => null,
            'is_covered' => null,
            'proceeds' => 80,
            'cost_basis' => 100,
        ]);
        $this->makeLot($account, [
            'lot_source' => 'analyzer',
            'tax_document_id' => null,
            'proceeds' => 1000,
            'cost_basis' => 100,
        ]);

        $report = app(CapitalGainsTaxReportService::class)->reportForUserYear($user->id, 2025);

        $this->assertSame(1, count($report['transactions']));
        $this->assertSame(-20.0, $report['scheduleDRollup'][0]->netGainOrLoss);
    }

    public function test_native_account_lots_are_used_as_fallback_when_no_imported_1099b_lots_exist(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        $this->makeLot($account, [
            'lot_source' => 'analyzer',
            'tax_document_id' => null,
            'proceeds' => 140,
            'cost_basis' => 100,
        ]);

        $report = app(CapitalGainsTaxReportService::class)->reportForUserYear($user->id, 2025);

        $this->assertSame(1, count($report['transactions']));
        $this->assertSame(40.0, $report['scheduleDRollup'][0]->netGainOrLoss);
    }

    public function test_documented_1099b_lots_still_win_when_matched_to_transaction_rows(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeTaxDocument($user->id);
        $sell = $this->makeSellTransaction($account);

        $this->makeLot($account, [
            'lot_source' => '1099b',
            'tax_document_id' => $document->id,
            'close_t_id' => $sell->t_id,
            'proceeds' => 150,
            'cost_basis' => 100,
        ]);
        $this->makeLot($account, [
            'lot_source' => 'analyzer',
            'tax_document_id' => null,
            'proceeds' => 1000,
            'cost_basis' => 100,
        ]);

        $report = app(CapitalGainsTaxReportService::class)->reportForUserYear($user->id, 2025);

        $this->assertSame(1, count($report['transactions']));
        $this->assertSame(50.0, $report['scheduleDRollup'][0]->netGainOrLoss);
    }

    public function test_schedule_d_uses_normalized_1099b_wash_sale_amounts_ahead_of_native_lots(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeTaxDocument($user->id);

        $this->makeLot($account, [
            'symbol' => 'BASIS',
            'description' => '1099-B basis-adjusted wash sale',
            'lot_source' => '1099b',
            'tax_document_id' => $document->id,
            'proceeds' => 1000,
            'cost_basis' => 1200,
            'wash_sale_disallowed' => 0,
            'realized_gain_loss' => -200,
        ]);
        $this->makeLot($account, [
            'symbol' => 'GROSS',
            'description' => '1099-B gross wash sale',
            'lot_source' => '1099b',
            'tax_document_id' => $document->id,
            'proceeds' => 1000,
            'cost_basis' => 1200,
            'wash_sale_disallowed' => 50,
            'realized_gain_loss' => -150,
        ]);
        $this->makeLot($account, [
            'symbol' => 'BASIS',
            'description' => 'Native fallback should not drive Schedule D',
            'lot_source' => 'analyzer',
            'tax_document_id' => null,
            'proceeds' => 10000,
            'cost_basis' => 100,
        ]);

        $report = app(CapitalGainsTaxReportService::class)->reportForUserYear($user->id, 2025);

        $this->assertSame(['BASIS', 'GROSS'], array_map(
            static fn ($transaction): ?string => $transaction->symbol,
            $report['transactions'],
        ));
        $this->assertSame(-350.0, $report['scheduleDRollup'][0]->netGainOrLoss);
        $this->assertSame(50.0, $report['scheduleDRollup'][0]->totalAdjustment);
    }

    public function test_account_lot_can_override_documented_1099b_lot_without_suppressing_other_reported_lots(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeTaxDocument($user->id);

        $reportedAapl = $this->makeLot($account, [
            'symbol' => 'AAPL',
            'description' => 'Broker AAPL',
            'lot_source' => '1099b',
            'tax_document_id' => $document->id,
            'proceeds' => 125,
            'cost_basis' => 100,
        ]);
        $accountAapl = $this->makeLot($account, [
            'symbol' => 'AAPL',
            'description' => 'Internal AAPL',
            'lot_source' => 'analyzer',
            'tax_document_id' => null,
            'proceeds' => 125,
            'cost_basis' => 80,
            'wash_sale_disallowed' => 10,
            'reconciliation_status' => 'accepted',
        ]);
        $reportedAapl->update([
            'superseded_by_lot_id' => $accountAapl->lot_id,
            'reconciliation_status' => 'accepted',
        ]);
        $this->makeLot($account, [
            'symbol' => 'MSFT',
            'description' => 'Broker MSFT',
            'lot_source' => '1099b',
            'tax_document_id' => $document->id,
            'proceeds' => 140,
            'cost_basis' => 100,
        ]);

        $report = app(CapitalGainsTaxReportService::class)->reportForUserYear($user->id, 2025);

        $this->assertSame(['AAPL', 'MSFT'], array_map(
            static fn ($transaction): ?string => $transaction->symbol,
            $report['transactions'],
        ));
        $this->assertSame([$accountAapl->lot_id, null], [
            $report['transactions'][0]->lotId,
            $report['transactions'][0]->taxDocumentId,
        ]);
        $this->assertSame(95.0, $report['scheduleDRollup'][0]->netGainOrLoss);
    }

    public function test_accepted_account_override_link_flips_schedule_d_to_account_lot_amounts(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeTaxDocument($user->id);

        $brokerLot = $this->makeLot($account, [
            'symbol' => 'AAPL',
            'description' => 'Broker AAPL',
            'lot_source' => '1099b',
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'tax_document_id' => $document->id,
            'proceeds' => 1000,
            'cost_basis' => 1100,
        ]);
        $accountLot = $this->makeLot($account, [
            'symbol' => 'AAPL',
            'description' => 'Accepted account AAPL',
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'tax_document_id' => null,
            'proceeds' => 1000,
            'cost_basis' => 1200,
        ]);
        FinLotReconciliationLink::create([
            'document_id' => $document->document_id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => $accountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
            'match_reason' => [
                'reason_code' => 'test_fixture',
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

        $report = app(CapitalGainsTaxReportService::class)->reportForUserYear($user->id, 2025);

        $this->assertSame(['Accepted account AAPL'], array_map(
            static fn ($transaction): string => $transaction->description,
            $report['transactions'],
        ));
        $this->assertSame(-200.0, $report['scheduleDRollup'][0]->netGainOrLoss);
        $this->assertSame(1200.0, $report['scheduleDRollup'][0]->totalCostBasis);
    }

    public function test_accepted_native_lots_are_used_for_reviewed_1099b_gaps(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeTaxDocument($user->id);

        $this->makeLot($account, [
            'symbol' => 'AAPL',
            'description' => 'Broker AAPL',
            'lot_source' => '1099b',
            'tax_document_id' => $document->id,
            'proceeds' => 125,
            'cost_basis' => 100,
        ]);
        $this->makeLot($account, [
            'symbol' => 'MSFT',
            'description' => 'Accepted account-only MSFT',
            'lot_source' => 'analyzer',
            'tax_document_id' => null,
            'proceeds' => 140,
            'cost_basis' => 100,
            'reconciliation_status' => 'accepted',
        ]);

        $report = app(CapitalGainsTaxReportService::class)->reportForUserYear($user->id, 2025);

        $this->assertSame(['AAPL', 'MSFT'], array_map(
            static fn ($transaction): ?string => $transaction->symbol,
            $report['transactions'],
        ));
        $this->assertSame(65.0, $report['scheduleDRollup'][0]->netGainOrLoss);
    }

    public function test_documented_lot_tax_documents_are_eager_loaded_for_report_generation(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeTaxDocument($user->id);

        foreach (range(1, 25) as $index) {
            $this->makeLot($account, [
                'symbol' => "DOC{$index}",
                'description' => "Documented lot {$index}",
                'lot_source' => '1099b',
                'tax_document_id' => $document->id,
                'proceeds' => 125 + $index,
                'cost_basis' => 100,
            ]);
        }

        DB::flushQueryLog();
        DB::enableQueryLog();

        $report = app(CapitalGainsTaxReportService::class)->reportForUserYear($user->id, 2025);

        $queryCount = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertSame(25, count($report['transactions']));
        $this->assertLessThanOrEqual(10, $queryCount);
    }

    private function makeAccount(int $userId, string $name = 'Brokerage'): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate([
            'acct_owner' => $userId,
            'acct_name' => $name,
            'acct_last_balance' => '0',
        ]));
    }

    private function makeTaxDocument(int $userId): FileForTaxDocument
    {
        return app(DocumentIngestionService::class)->createTaxFormDetail([
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
    private function makeLot(FinAccounts $account, array $overrides): FinAccountLot
    {
        $costBasis = (float) ($overrides['cost_basis'] ?? 100);
        $proceeds = (float) ($overrides['proceeds'] ?? 125);
        $documentId = $overrides['document_id'] ?? null;
        if ($documentId === null && array_key_exists('tax_document_id', $overrides) && $overrides['tax_document_id'] !== null) {
            $taxDocument = FileForTaxDocument::query()->findOrFail((int) $overrides['tax_document_id']);
            $documentId = (int) $taxDocument->document_id;
        }

        return FinAccountLot::create([
            'acct_id' => $account->acct_id,
            'symbol' => $overrides['symbol'] ?? 'AAPL',
            'description' => $overrides['description'] ?? 'Apple Inc.',
            'quantity' => $overrides['quantity'] ?? 10,
            'purchase_date' => $overrides['purchase_date'] ?? '2025-01-01',
            'sale_date' => $overrides['sale_date'] ?? '2025-02-01',
            'proceeds' => $proceeds,
            'cost_basis' => $costBasis,
            'realized_gain_loss' => $overrides['realized_gain_loss'] ?? ($proceeds - $costBasis),
            'is_short_term' => $overrides['is_short_term'] ?? true,
            'lot_source' => $overrides['lot_source'] ?? null,
            'source' => $overrides['source'] ?? ($documentId !== null ? FinAccountLot::SOURCE_BROKER_1099B : FinAccountLot::SOURCE_ACCOUNT_DERIVED),
            'document_id' => $documentId,
            'form_8949_box' => array_key_exists('form_8949_box', $overrides) ? $overrides['form_8949_box'] : 'A',
            'is_covered' => array_key_exists('is_covered', $overrides) ? $overrides['is_covered'] : true,
            'wash_sale_disallowed' => array_key_exists('wash_sale_disallowed', $overrides) ? $overrides['wash_sale_disallowed'] : null,
            'close_t_id' => $overrides['close_t_id'] ?? null,
            'superseded_by_lot_id' => $overrides['superseded_by_lot_id'] ?? null,
            'reconciliation_status' => $overrides['reconciliation_status'] ?? null,
        ]);
    }

    private function makeSellTransaction(FinAccounts $account): FinAccountLineItems
    {
        return FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2025-02-01',
            't_type' => 'Sell',
            't_symbol' => 'AAPL',
            't_qty' => -10,
            't_amt' => 150,
            't_source' => 'import',
        ]);
    }
}
