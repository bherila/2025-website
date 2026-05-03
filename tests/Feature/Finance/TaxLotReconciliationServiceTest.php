<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\LotMatcher;
use App\Services\Finance\TaxLotReconciliationService;
use Tests\TestCase;

class TaxLotReconciliationServiceTest extends TestCase
{
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

    private function makeTaxDocument(int $userId, string $filename = 'broker-1099.pdf'): FileForTaxDocument
    {
        return FileForTaxDocument::create([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => $filename,
            'stored_filename' => $filename,
            's3_path' => "tax_docs/{$userId}/{$filename}",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => str_repeat('a', 64),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        $quantity = (float) ($overrides['quantity'] ?? 10);
        $costBasis = (float) ($overrides['cost_basis'] ?? 1000);

        return FinAccountLot::create(array_merge([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => $quantity,
            'purchase_date' => '2024-01-02',
            'cost_basis' => $costBasis,
            'cost_per_unit' => $quantity > 0 ? $costBasis / $quantity : null,
            'sale_date' => '2025-02-03',
            'proceeds' => 1250,
            'realized_gain_loss' => 250,
            'is_short_term' => false,
            'lot_source' => 'analyzer',
        ], $overrides));
    }

    public function test_lot_matcher_reuses_existing_sell_transaction_dedupe_shape(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $lot = $this->makeLot($account, [
            'lot_source' => '1099b',
            'quantity' => 5,
            'sale_date' => '2025-04-01',
            'proceeds' => 500,
        ]);

        FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2025-04-01',
            't_type' => 'Sell',
            't_symbol' => 'AAPL',
            't_qty' => -5,
            't_amt' => -500,
            't_source' => 'import',
        ]);

        $matcher = app(LotMatcher::class);

        $this->assertTrue($matcher->matchingSellTransactionExists($lot));
        $this->assertFalse($matcher->matchingSellTransactionExists($this->makeLot($account, [
            'lot_source' => '1099b',
            'quantity' => 6,
            'sale_date' => '2025-04-01',
            'proceeds' => 500,
        ])));
    }

    public function test_lot_matcher_keeps_symbol_and_cusip_namespaces_separate(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $lot = $this->makeLot($account, [
            'lot_source' => '1099b',
            'symbol' => 'AAPL',
            'cusip' => '037833100',
            'quantity' => 5,
            'sale_date' => '2025-04-01',
            'proceeds' => 500,
        ]);

        FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2025-04-01',
            't_type' => 'Sell',
            't_symbol' => null,
            't_cusip' => 'AAPL',
            't_qty' => -5,
            't_amt' => 500,
            't_source' => 'import',
        ]);

        $this->assertFalse(app(LotMatcher::class)->matchingSellTransactionExists($lot));
    }

    public function test_lot_matcher_allows_small_trade_and_settlement_date_drift(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $lot = $this->makeLot($account, [
            'lot_source' => '1099b',
            'quantity' => 5,
            'sale_date' => '2025-04-01',
            'proceeds' => 500,
        ]);

        FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2025-04-03',
            't_type' => 'Sell',
            't_symbol' => 'AAPL',
            't_qty' => -5,
            't_amt' => 500,
            't_source' => 'import',
        ]);

        $this->assertTrue(app(LotMatcher::class)->matchingSellTransactionExists($lot));
    }

    public function test_lot_matcher_skips_long_term_various_purchase_date_fallback(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $lot = $this->makeLot($account, [
            'lot_source' => '1099b',
            'purchase_date' => '2025-04-01',
            'sale_date' => '2025-04-01',
            'cost_basis' => 500,
            'is_short_term' => false,
        ]);

        FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2025-04-01',
            't_type' => 'Buy',
            't_symbol' => 'AAPL',
            't_qty' => 10,
            't_amt' => -500,
            't_source' => 'import',
        ]);

        $this->assertNull(app(LotMatcher::class)->matchingBuyTransaction($lot));
    }

    public function test_reconcile_classifies_matched_variance_missing_duplicate_and_unresolved_rows(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $taxDocument = $this->makeTaxDocument($user->id);

        $matched1099 = $this->makeLot($account, [
            'symbol' => 'AAPL',
            'lot_source' => '1099b',
            'tax_document_id' => $taxDocument->id,
        ]);
        $this->makeLot($account, [
            'symbol' => 'AAPL',
            'lot_source' => 'analyzer',
            'purchase_date' => $matched1099->purchase_date,
            'sale_date' => $matched1099->sale_date,
            'quantity' => $matched1099->quantity,
            'proceeds' => $matched1099->proceeds,
            'cost_basis' => $matched1099->cost_basis,
            'realized_gain_loss' => $matched1099->realized_gain_loss,
        ]);

        $this->makeLot($account, [
            'symbol' => 'MSFT',
            'lot_source' => '1099b',
            'tax_document_id' => $taxDocument->id,
            'cost_basis' => 900,
            'realized_gain_loss' => 350,
        ]);
        $this->makeLot($account, [
            'symbol' => 'MSFT',
            'lot_source' => 'analyzer',
            'cost_basis' => 950,
            'realized_gain_loss' => 300,
        ]);

        $this->makeLot($account, [
            'symbol' => 'TSLA',
            'lot_source' => '1099b',
            'tax_document_id' => $taxDocument->id,
        ]);

        $this->makeLot($account, [
            'symbol' => 'GOOG',
            'lot_source' => 'analyzer',
        ]);

        $this->makeLot($account, [
            'symbol' => 'NVDA',
            'lot_source' => '1099b',
            'tax_document_id' => $taxDocument->id,
        ]);
        $this->makeLot($account, ['symbol' => 'NVDA', 'lot_source' => 'analyzer']);
        $this->makeLot($account, ['symbol' => 'NVDA', 'lot_source' => 'manual']);

        TaxDocumentAccount::create([
            'tax_document_id' => $taxDocument->id,
            'account_id' => null,
            'form_type' => '1099_b',
            'tax_year' => 2025,
            'ai_identifier' => '1234',
            'ai_account_name' => 'Unmatched Brokerage',
        ]);

        $result = app(TaxLotReconciliationService::class)->reconcile($user->id, 2025);

        $this->assertSame([
            'matched' => 1,
            'variance' => 1,
            'missing_account' => 1,
            'missing_1099b' => 1,
            'duplicates' => 1,
            'unresolved_account_links' => 1,
            'matched_open_transactions' => 0,
            'matched_close_transactions' => 0,
            'missing_open_transactions' => 4,
            'missing_close_transactions' => 4,
        ], $result['summary']);

        $statuses = collect($result['accounts'][0]['rows'])->pluck('status')->all();
        $this->assertContains('matched', $statuses);
        $this->assertContains('variance', $statuses);
        $this->assertContains('missing_account', $statuses);
        $this->assertContains('missing_1099b', $statuses);
        $this->assertContains('duplicate', $statuses);
        $this->assertSame('Unmatched Brokerage', $result['unresolved_account_links'][0]['ai_account_name']);
    }

    public function test_reconcile_reports_native_transaction_matches_for_reported_lots(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $taxDocument = $this->makeTaxDocument($user->id);

        $reportedLot = $this->makeLot($account, [
            'symbol' => 'AAPL',
            'cusip' => '037833100',
            'lot_source' => '1099b',
            'tax_document_id' => $taxDocument->id,
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'cost_basis' => 1000,
            'sale_date' => '2025-02-03',
            'proceeds' => 1250,
        ]);

        $buy = FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2024-01-02',
            't_type' => 'Buy',
            't_symbol' => 'AAPL',
            't_cusip' => '037833100',
            't_qty' => 10,
            't_amt' => -1000,
            't_source' => 'import',
        ]);

        $sell = FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2025-02-03',
            't_type' => 'Sell',
            't_symbol' => null,
            't_cusip' => '037833100',
            't_qty' => -10,
            't_amt' => 1250,
            't_source' => 'import',
        ]);

        $reportedLot->update([
            'open_t_id' => $buy->t_id,
            'close_t_id' => $sell->t_id,
        ]);

        $result = app(TaxLotReconciliationService::class)->reconcile($user->id, 2025);
        $row = $result['accounts'][0]['rows'][0];

        $this->assertSame(1, $result['summary']['matched_open_transactions']);
        $this->assertSame(1, $result['summary']['matched_close_transactions']);
        $this->assertSame('matched', $row['transaction_match']['opening']['status']);
        $this->assertSame($buy->t_id, $row['transaction_match']['opening']['transaction']['t_id']);
        $this->assertSame('matched', $row['transaction_match']['closing']['status']);
        $this->assertSame($sell->t_id, $row['transaction_match']['closing']['transaction']['t_id']);
    }

    public function test_reconcile_matches_lots_inside_disposition_tolerances(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $taxDocument = $this->makeTaxDocument($user->id);

        $this->makeLot($account, [
            'lot_source' => '1099b',
            'tax_document_id' => $taxDocument->id,
            'quantity' => 10.000001,
            'proceeds' => 1250.02,
        ]);
        $this->makeLot($account, [
            'lot_source' => 'analyzer',
            'quantity' => 10.000000,
            'proceeds' => 1250.01,
        ]);

        $result = app(TaxLotReconciliationService::class)->reconcile($user->id, 2025);

        $this->assertSame(1, $result['summary']['matched']);
        $this->assertSame('matched', $result['accounts'][0]['rows'][0]['status']);
    }
}
