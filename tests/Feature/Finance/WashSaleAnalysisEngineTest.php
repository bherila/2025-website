<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Services\Finance\CapitalGains\CanonicalCapitalGainTransaction;
use App\Services\Finance\CapitalGains\CapitalGainsImportNormalizer;
use App\Services\Finance\CapitalGains\Form8949ReportBuilder;
use App\Services\Finance\CapitalGains\WashSaleAdjustment;
use App\Services\Finance\CapitalGains\WashSaleAnalysisEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WashSaleAnalysisEngineTest extends TestCase
{
    use RefreshDatabase;

    private WashSaleAnalysisEngine $engine;

    private CapitalGainsImportNormalizer $normalizer;

    private Form8949ReportBuilder $reportBuilder;

    protected function setUp(): void
    {
        parent::setUp();
        $this->engine = app(WashSaleAnalysisEngine::class);
        $this->normalizer = app(CapitalGainsImportNormalizer::class);
        $this->reportBuilder = app(Form8949ReportBuilder::class);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function makeAccount(int $userId, string $name = 'Brokerage'): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId, $name) {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => $name,
                'acct_last_balance' => '0',
            ]);
        });
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        $costBasis = (float) ($overrides['cost_basis'] ?? 1000);
        $proceeds = isset($overrides['proceeds']) ? (float) $overrides['proceeds'] : null;
        $gain = $proceeds !== null ? $proceeds - $costBasis : null;

        return FinAccountLot::create([
            'acct_id' => $account->acct_id,
            'symbol' => $overrides['symbol'] ?? 'AAPL',
            'description' => $overrides['description'] ?? 'Test Stock',
            'quantity' => $overrides['quantity'] ?? 10,
            'purchase_date' => $overrides['purchase_date'] ?? '2024-01-01',
            'sale_date' => $overrides['sale_date'] ?? null,
            'cost_basis' => $costBasis,
            'proceeds' => $proceeds,
            'realized_gain_loss' => $gain,
            'is_short_term' => $overrides['is_short_term'] ?? true,
            'lot_source' => $overrides['lot_source'] ?? 'account_lot',
            'form_8949_box' => $overrides['form_8949_box'] ?? 'A',
            'is_covered' => $overrides['is_covered'] ?? true,
            'wash_sale_disallowed' => $overrides['wash_sale_disallowed'] ?? null,
        ]);
    }

    // -------------------------------------------------------------------------
    // WashSaleAnalysisEngine tests
    // -------------------------------------------------------------------------

    public function test_no_wash_sale_when_sale_is_a_gain(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        // A profit sale — should NOT generate a wash-sale adjustment
        $this->makeLot($account, [
            'purchase_date' => '2024-06-01',
            'sale_date' => '2024-12-01',
            'cost_basis' => 1000,
            'proceeds' => 1200,
        ]);

        // A purchase after the sale — could be replacement but sale is not a loss
        $this->makeLot($account, [
            'purchase_date' => '2024-12-15',
            'sale_date' => null,
        ]);

        $adjustments = $this->engine->analyze([$account->acct_id], 2024);

        $this->assertEmpty($adjustments);
    }

    public function test_same_account_wash_sale_detected(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        // Loss sale
        $this->makeLot($account, [
            'symbol' => 'TSLA',
            'purchase_date' => '2024-10-01',
            'sale_date' => '2024-12-01',
            'cost_basis' => 1000,
            'proceeds' => 800,
        ]);

        // Replacement purchase within 30 days (same account)
        $this->makeLot($account, [
            'symbol' => 'TSLA',
            'purchase_date' => '2024-12-15',
            'sale_date' => null,
            'cost_basis' => 810,
        ]);

        $adjustments = $this->engine->analyze([$account->acct_id], 2024);

        $this->assertCount(1, $adjustments);
        $this->assertFalse($adjustments[0]->isCrossAccount);
        $this->assertEquals('TSLA', $adjustments[0]->symbol);
        $this->assertGreaterThan(0, $adjustments[0]->disallowedLoss);
        $this->assertEquals($account->acct_id, $adjustments[0]->saleAccountId);
        $this->assertEquals($account->acct_id, $adjustments[0]->replacementAccountId);
    }

    public function test_cross_account_wash_sale_detected(): void
    {
        $user = $this->createUser();
        $account1 = $this->makeAccount($user->id, 'Brokerage A');
        $account2 = $this->makeAccount($user->id, 'Brokerage B');

        // Loss sale in account 1
        $this->makeLot($account1, [
            'symbol' => 'TSLA',
            'purchase_date' => '2024-09-01',
            'sale_date' => '2024-12-01',
            'cost_basis' => 2000,
            'proceeds' => 1500,
        ]);

        // Replacement purchase in account 2 within 30 days
        $this->makeLot($account2, [
            'symbol' => 'TSLA',
            'purchase_date' => '2024-12-10',
            'sale_date' => null,
            'cost_basis' => 1520,
        ]);

        $adjustments = $this->engine->analyze([$account1->acct_id, $account2->acct_id], 2024);

        $this->assertCount(1, $adjustments);
        $this->assertTrue($adjustments[0]->isCrossAccount);
        $this->assertEquals($account1->acct_id, $adjustments[0]->saleAccountId);
        $this->assertEquals($account2->acct_id, $adjustments[0]->replacementAccountId);
        $this->assertEquals('TSLA', $adjustments[0]->symbol);
    }

    public function test_purchase_outside_window_not_flagged(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        // Loss sale
        $this->makeLot($account, [
            'symbol' => 'MSFT',
            'purchase_date' => '2024-01-01',
            'sale_date' => '2024-06-01',
            'cost_basis' => 1000,
            'proceeds' => 800,
        ]);

        // Purchase 31 days after sale — just outside the 30-day window
        $this->makeLot($account, [
            'symbol' => 'MSFT',
            'purchase_date' => '2024-07-02',
            'sale_date' => null,
        ]);

        $adjustments = $this->engine->analyze([$account->acct_id], 2024);

        $this->assertEmpty($adjustments);
    }

    public function test_purchase_before_sale_within_window_flagged(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        // Purchase 20 days BEFORE the loss sale
        $this->makeLot($account, [
            'symbol' => 'NVDA',
            'purchase_date' => '2024-11-01',
            'sale_date' => null,
        ]);

        // Loss sale
        $this->makeLot($account, [
            'symbol' => 'NVDA',
            'purchase_date' => '2024-09-01',
            'sale_date' => '2024-11-21',
            'cost_basis' => 1000,
            'proceeds' => 700,
        ]);

        $adjustments = $this->engine->analyze([$account->acct_id], 2024);

        $this->assertCount(1, $adjustments);
    }

    public function test_same_day_replacement_purchase_is_flagged(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        $this->makeLot($account, [
            'symbol' => 'AMD',
            'quantity' => 10,
            'purchase_date' => '2024-01-01',
            'sale_date' => '2024-06-01',
            'cost_basis' => 1000,
            'proceeds' => 800,
        ]);

        $this->makeLot($account, [
            'symbol' => 'AMD',
            'quantity' => 10,
            'purchase_date' => '2024-06-01',
            'sale_date' => null,
        ]);

        $adjustments = $this->engine->analyze([$account->acct_id], 2024);

        $this->assertCount(1, $adjustments);
        $this->assertEquals(200.0, $adjustments[0]->disallowedLoss);
    }

    public function test_loss_is_allocated_across_multiple_replacement_purchases(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        $this->makeLot($account, [
            'symbol' => 'TSLA',
            'quantity' => 100,
            'purchase_date' => '2024-01-01',
            'sale_date' => '2024-06-01',
            'cost_basis' => 2000,
            'proceeds' => 1000,
        ]);

        foreach ([30, 30, 50] as $index => $quantity) {
            $this->makeLot($account, [
                'symbol' => 'TSLA',
                'quantity' => $quantity,
                'purchase_date' => '2024-06-'.str_pad((string) ($index + 2), 2, '0', STR_PAD_LEFT),
                'sale_date' => null,
            ]);
        }

        $adjustments = $this->engine->analyze([$account->acct_id], 2024);

        $this->assertCount(3, $adjustments);
        $this->assertEquals([300.0, 300.0, 400.0], array_map(fn (WashSaleAdjustment $adjustment): float => $adjustment->disallowedLoss, $adjustments));
    }

    public function test_replacement_purchase_quantity_is_consumed_across_loss_sales(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        foreach (['2024-06-01', '2024-06-02'] as $saleDate) {
            $this->makeLot($account, [
                'symbol' => 'NVDA',
                'quantity' => 50,
                'purchase_date' => '2024-01-01',
                'sale_date' => $saleDate,
                'cost_basis' => 1000,
                'proceeds' => 500,
            ]);
        }

        $this->makeLot($account, [
            'symbol' => 'NVDA',
            'quantity' => 75,
            'purchase_date' => '2024-06-10',
            'sale_date' => null,
        ]);

        $adjustments = $this->engine->analyze([$account->acct_id], 2024);

        $this->assertCount(2, $adjustments);
        $this->assertEquals([500.0, 250.0], array_map(fn (WashSaleAdjustment $adjustment): float => $adjustment->disallowedLoss, $adjustments));
    }

    public function test_empty_account_ids_returns_empty(): void
    {
        $adjustments = $this->engine->analyze([], 2024);

        $this->assertEmpty($adjustments);
    }

    public function test_no_lots_returns_empty(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        $adjustments = $this->engine->analyze([$account->acct_id], 2024);

        $this->assertEmpty($adjustments);
    }

    // -------------------------------------------------------------------------
    // Form8949ReportBuilder tests
    // -------------------------------------------------------------------------

    public function test_report_builder_produces_individual_row(): void
    {
        $txn = new CanonicalCapitalGainTransaction(
            id: 'account_lot:1',
            source: 'account_lot',
            symbol: 'AAPL',
            description: 'Apple Inc.',
            cusip: null,
            quantity: 10.0,
            dateAcquired: '2024-01-01',
            dateSold: '2024-12-01',
            proceeds: 1500.0,
            costBasis: 1000.0,
            washSaleDisallowed: 0.0,
            realizedGainLoss: 500.0,
            isShortTerm: true,
            form8949Box: 'A',
            isCovered: true,
            accruedMarketDiscount: null,
            accountId: 1,
            accountName: 'Brokerage',
            taxDocumentId: null,
            lotId: 1,
            closeTransactionId: null,
        );

        $rows = $this->reportBuilder->buildRows([$txn], [], 'form_8949_transactions');

        $this->assertCount(1, $rows);
        $this->assertEquals('A', $rows[0]->form8949Box);
        $this->assertEquals(1500.0, $rows[0]->proceeds);
        $this->assertEquals(1000.0, $rows[0]->costBasis);
        $this->assertEquals(500.0, $rows[0]->gainOrLoss);
        $this->assertFalse($rows[0]->isSummaryRow);
    }

    public function test_report_builder_applies_wash_sale_adjustment(): void
    {
        $txn = new CanonicalCapitalGainTransaction(
            id: 'account_lot:42',
            source: 'account_lot',
            symbol: 'TSLA',
            description: 'Tesla Inc.',
            cusip: null,
            quantity: 10.0,
            dateAcquired: '2024-01-01',
            dateSold: '2024-12-01',
            proceeds: 800.0,
            costBasis: 1000.0,
            washSaleDisallowed: 0.0,
            realizedGainLoss: -200.0,
            isShortTerm: true,
            form8949Box: 'A',
            isCovered: true,
            accruedMarketDiscount: null,
            accountId: 1,
            accountName: 'Brokerage A',
            taxDocumentId: null,
            lotId: 42,
            closeTransactionId: null,
        );

        $adj = new WashSaleAdjustment(
            id: 'ws:lot:42:lot:99',
            lossSaleId: 'account_lot:42',
            replacementPurchaseId: 'account_lot:99',
            symbol: 'TSLA',
            saleDateStr: '2024-12-01',
            replacementDateStr: '2024-12-15',
            disallowedLoss: 200.0,
            saleAccountId: 1,
            saleAccountName: 'Brokerage A',
            replacementAccountId: 2,
            replacementAccountName: 'Brokerage B',
            isCrossAccount: true,
            reason: 'Cross-account wash sale',
            saleLotId: 42,
            replacementLotId: 99,
        );

        // Even in form_8949_summary mode, cross-account adjustment forces individual row
        $rows = $this->reportBuilder->buildRows([$txn], [$adj], 'form_8949_summary');

        $this->assertCount(1, $rows);
        $this->assertEquals(200.0, $rows[0]->adjustmentAmount);
        $this->assertEquals('W', $rows[0]->adjustmentCode);
        // Net gain = 800 - 1000 + 200 = 0
        $this->assertEquals(0.0, $rows[0]->gainOrLoss);
        $this->assertFalse($rows[0]->isSummaryRow);
    }

    public function test_report_builder_matches_adjustment_by_sale_lot_id_across_source_prefixes(): void
    {
        $txn = new CanonicalCapitalGainTransaction(
            id: '1099b:42',
            source: '1099b',
            symbol: 'TSLA',
            description: 'Tesla Inc.',
            cusip: null,
            quantity: 10.0,
            dateAcquired: '2024-01-01',
            dateSold: '2024-12-01',
            proceeds: 800.0,
            costBasis: 1000.0,
            washSaleDisallowed: 0.0,
            realizedGainLoss: -200.0,
            isShortTerm: true,
            form8949Box: 'A',
            isCovered: true,
            accruedMarketDiscount: null,
            accountId: 1,
            accountName: 'Brokerage A',
            taxDocumentId: 10,
            lotId: 42,
            closeTransactionId: null,
        );

        $adj = new WashSaleAdjustment(
            id: 'ws:lot:42:lot:99',
            lossSaleId: 'account_lot:42',
            replacementPurchaseId: 'account_lot:99',
            symbol: 'TSLA',
            saleDateStr: '2024-12-01',
            replacementDateStr: '2024-12-15',
            disallowedLoss: 200.0,
            saleAccountId: 1,
            saleAccountName: 'Brokerage A',
            replacementAccountId: 2,
            replacementAccountName: 'Brokerage B',
            isCrossAccount: true,
            reason: 'Cross-account wash sale',
            saleLotId: 42,
            replacementLotId: 99,
        );

        $rows = $this->reportBuilder->buildRows([$txn], [$adj], 'form_8949_transactions');

        $this->assertEquals(200.0, $rows[0]->adjustmentAmount);
        $this->assertEquals('W', $rows[0]->adjustmentCode);
    }

    public function test_schedule_d_rollup_groups_by_box(): void
    {
        $idCounter = 0;
        $makeCanonical = function (string $box, float $proceeds, float $basis) use (&$idCounter): CanonicalCapitalGainTransaction {
            $idCounter++;

            return new CanonicalCapitalGainTransaction(
                id: 'account_lot:'.$idCounter,
                source: 'account_lot',
                symbol: 'AAPL',
                description: 'Apple Inc.',
                cusip: null,
                quantity: 10.0,
                dateAcquired: '2024-01-01',
                dateSold: '2024-12-01',
                proceeds: $proceeds,
                costBasis: $basis,
                washSaleDisallowed: 0.0,
                realizedGainLoss: $proceeds - $basis,
                isShortTerm: in_array($box, ['A', 'B', 'C'], true),
                form8949Box: $box,
                isCovered: true,
                accruedMarketDiscount: null,
                accountId: 1,
                accountName: 'Brokerage',
                taxDocumentId: null,
                lotId: null,
                closeTransactionId: null,
            );
        };

        $transactions = [
            $makeCanonical('A', 1000.0, 800.0),
            $makeCanonical('A', 500.0, 600.0),
            $makeCanonical('D', 2000.0, 1500.0),
        ];

        $rollup = $this->reportBuilder->buildScheduleDRollup($transactions, []);

        $this->assertCount(2, $rollup);

        $stRollup = array_values(array_filter($rollup, fn ($r) => $r->form8949Box === 'A'))[0];
        $ltRollup = array_values(array_filter($rollup, fn ($r) => $r->form8949Box === 'D'))[0];

        $this->assertTrue($stRollup->isShortTerm);
        $this->assertEquals(1500.0, $stRollup->totalProceeds);
        $this->assertEquals(1400.0, $stRollup->totalCostBasis);
        $this->assertEquals(100.0, $stRollup->netGainOrLoss);

        $this->assertFalse($ltRollup->isShortTerm);
        $this->assertEquals(500.0, $ltRollup->netGainOrLoss);
        $this->assertEquals('8b', $ltRollup->scheduleDLine);
    }

    public function test_schedule_d_summary_uses_direct_summary_lines_for_covered_unadjusted_boxes(): void
    {
        $shortTerm = new CanonicalCapitalGainTransaction(
            id: 'account_lot:1',
            source: 'account_lot',
            symbol: 'AAPL',
            description: 'Apple Inc.',
            cusip: null,
            quantity: 10.0,
            dateAcquired: '2024-01-01',
            dateSold: '2024-12-01',
            proceeds: 1000.0,
            costBasis: 800.0,
            washSaleDisallowed: 0.0,
            realizedGainLoss: 200.0,
            isShortTerm: true,
            form8949Box: 'A',
            isCovered: true,
            accruedMarketDiscount: null,
            accountId: 1,
            accountName: 'Brokerage',
            taxDocumentId: null,
            lotId: 1,
            closeTransactionId: null,
        );
        $longTerm = new CanonicalCapitalGainTransaction(
            id: 'account_lot:2',
            source: 'account_lot',
            symbol: 'MSFT',
            description: 'Microsoft Corp.',
            cusip: null,
            quantity: 10.0,
            dateAcquired: '2022-01-01',
            dateSold: '2024-12-01',
            proceeds: 2000.0,
            costBasis: 1500.0,
            washSaleDisallowed: 0.0,
            realizedGainLoss: 500.0,
            isShortTerm: false,
            form8949Box: 'D',
            isCovered: true,
            accruedMarketDiscount: null,
            accountId: 1,
            accountName: 'Brokerage',
            taxDocumentId: null,
            lotId: 2,
            closeTransactionId: null,
        );

        $rollup = $this->reportBuilder->buildScheduleDRollup([$shortTerm, $longTerm], [], 'schedule_d_summary');

        $this->assertEquals('1a', $rollup[0]->scheduleDLine);
        $this->assertEquals('8a', $rollup[1]->scheduleDLine);
    }

    public function test_schedule_d_summary_splits_adjusted_and_unadjusted_covered_boxes(): void
    {
        $directShortTerm = new CanonicalCapitalGainTransaction(
            id: 'account_lot:1',
            source: 'account_lot',
            symbol: 'AAPL',
            description: 'Apple Inc.',
            cusip: null,
            quantity: 10.0,
            dateAcquired: '2024-01-01',
            dateSold: '2024-12-01',
            proceeds: 1000.0,
            costBasis: 800.0,
            washSaleDisallowed: 0.0,
            realizedGainLoss: 200.0,
            isShortTerm: true,
            form8949Box: 'A',
            isCovered: true,
            accruedMarketDiscount: null,
            accountId: 1,
            accountName: 'Brokerage',
            taxDocumentId: 1,
            lotId: 1,
            closeTransactionId: null,
        );
        $form8949ShortTerm = new CanonicalCapitalGainTransaction(
            id: 'account_lot:2',
            source: 'account_lot',
            symbol: 'MSFT',
            description: 'Microsoft Corp.',
            cusip: null,
            quantity: 10.0,
            dateAcquired: '2024-01-01',
            dateSold: '2024-12-01',
            proceeds: 500.0,
            costBasis: 600.0,
            washSaleDisallowed: 10.0,
            realizedGainLoss: -90.0,
            isShortTerm: true,
            form8949Box: 'A',
            isCovered: true,
            accruedMarketDiscount: null,
            accountId: 1,
            accountName: 'Brokerage',
            taxDocumentId: 2,
            lotId: 2,
            closeTransactionId: null,
        );

        $rollups = $this->reportBuilder->buildScheduleDRollup([$directShortTerm, $form8949ShortTerm], [], 'schedule_d_summary');
        $byLine = collect($rollups)->mapWithKeys(fn ($rollup): array => [$rollup->scheduleDLine => $rollup->netGainOrLoss])->all();

        $this->assertSame(200.0, $byLine['1a']);
        $this->assertSame(-90.0, $byLine['1b']);
    }

    public function test_unknown_term_transaction_is_not_defaulted_to_box_c(): void
    {
        $txn = new CanonicalCapitalGainTransaction(
            id: 'account_lot:1',
            source: 'account_lot',
            symbol: 'AAPL',
            description: 'Apple Inc.',
            cusip: null,
            quantity: 10.0,
            dateAcquired: null,
            dateSold: '2024-12-01',
            proceeds: 1000.0,
            costBasis: 800.0,
            washSaleDisallowed: 0.0,
            realizedGainLoss: 200.0,
            isShortTerm: null,
            form8949Box: null,
            isCovered: true,
            accruedMarketDiscount: null,
            accountId: 1,
            accountName: 'Brokerage',
            taxDocumentId: null,
            lotId: 1,
            closeTransactionId: null,
        );

        $rows = $this->reportBuilder->buildRows([$txn], [], 'form_8949_transactions');
        $rollup = $this->reportBuilder->buildScheduleDRollup([$txn]);

        $this->assertNull($rows[0]->form8949Box);
        $this->assertEmpty($rollup);
    }

    // -------------------------------------------------------------------------
    // CapitalGainsImportNormalizer tests
    // -------------------------------------------------------------------------

    public function test_normalizer_infers_short_term_covered_as_box_a(): void
    {
        $txn = new CanonicalCapitalGainTransaction(
            id: 'x:1', source: 'account_lot', symbol: 'AAPL', description: '', cusip: null,
            quantity: 10, dateAcquired: '2024-01-01', dateSold: '2024-12-01',
            proceeds: 100, costBasis: 80, washSaleDisallowed: 0, realizedGainLoss: 20,
            isShortTerm: true, form8949Box: null, isCovered: true,
            accruedMarketDiscount: null, accountId: 1, accountName: null,
            taxDocumentId: null, lotId: null, closeTransactionId: null,
        );

        $this->assertEquals('A', $this->normalizer->inferForm8949Box($txn));
    }

    public function test_normalizer_infers_long_term_uncovered_as_box_e(): void
    {
        $txn = new CanonicalCapitalGainTransaction(
            id: 'x:2', source: 'account_lot', symbol: 'AAPL', description: '', cusip: null,
            quantity: 10, dateAcquired: '2022-01-01', dateSold: '2024-12-01',
            proceeds: 100, costBasis: 80, washSaleDisallowed: 0, realizedGainLoss: 20,
            isShortTerm: false, form8949Box: null, isCovered: false,
            accruedMarketDiscount: null, accountId: 1, accountName: null,
            taxDocumentId: null, lotId: null, closeTransactionId: null,
        );

        $this->assertEquals('E', $this->normalizer->inferForm8949Box($txn));
    }

    public function test_normalizer_from_account_lot(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $lot = $this->makeLot($account, [
            'symbol' => 'NVDA',
            'purchase_date' => '2023-06-01',
            'sale_date' => '2024-12-15',
            'cost_basis' => 500,
            'proceeds' => 750,
            'is_short_term' => false,
            'form_8949_box' => 'D',
        ]);
        $lot->load('account');

        $txn = $this->normalizer->fromAccountLot($lot);

        $this->assertEquals('account_lot', $txn->source);
        $this->assertEquals('NVDA', $txn->symbol);
        $this->assertEquals(500.0, $txn->costBasis);
        $this->assertEquals(750.0, $txn->proceeds);
        $this->assertFalse($txn->isShortTerm);
        $this->assertEquals('D', $txn->form8949Box);
        $this->assertEquals((int) $account->acct_id, $txn->accountId);
    }
}
