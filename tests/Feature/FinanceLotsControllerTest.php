<?php

namespace Tests\Feature;

use App\Models\FinanceTool\FinAccountLot;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FinanceLotsControllerTest extends TestCase
{
    private function createAccountWithLots(int $userId): int
    {
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $userId,
            'acct_name' => 'Test Brokerage',
            'acct_last_balance' => '100000',
        ]);

        // Open lots
        FinAccountLot::insert([
            [
                'acct_id' => $acctId,
                'symbol' => 'AAPL',
                'description' => 'Apple Inc.',
                'quantity' => 100,
                'purchase_date' => '2025-01-15',
                'cost_basis' => 15000.00,
                'cost_per_unit' => 150.00,
                'sale_date' => null,
                'proceeds' => null,
                'realized_gain_loss' => null,
                'is_short_term' => null,
                'lot_source' => 'import',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'acct_id' => $acctId,
                'symbol' => 'GOOG',
                'description' => 'Alphabet Inc.',
                'quantity' => 50,
                'purchase_date' => '2025-03-01',
                'cost_basis' => 7500.00,
                'cost_per_unit' => 150.00,
                'sale_date' => null,
                'proceeds' => null,
                'realized_gain_loss' => null,
                'is_short_term' => null,
                'lot_source' => 'import',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        // Closed lots (short-term: purchased and sold within 1 year)
        FinAccountLot::insert([
            [
                'acct_id' => $acctId,
                'symbol' => 'MSFT',
                'description' => 'Microsoft Corp.',
                'quantity' => 25,
                'purchase_date' => '2025-06-01',
                'cost_basis' => 10000.00,
                'cost_per_unit' => 400.00,
                'sale_date' => '2025-12-15',
                'proceeds' => 11000.00,
                'realized_gain_loss' => 1000.00,
                'is_short_term' => true,
                'lot_source' => 'import',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        // Closed lots (long-term: held > 1 year)
        FinAccountLot::insert([
            [
                'acct_id' => $acctId,
                'symbol' => 'AMZN',
                'description' => 'Amazon.com Inc.',
                'quantity' => 10,
                'purchase_date' => '2023-01-01',
                'cost_basis' => 9000.00,
                'cost_per_unit' => 900.00,
                'sale_date' => '2025-06-15',
                'proceeds' => 8000.00,
                'realized_gain_loss' => -1000.00,
                'is_short_term' => false,
                'lot_source' => 'import',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        return $acctId;
    }

    public function test_listing_open_lots(): void
    {
        $user = $this->createAdminUser();
        $acctId = $this->createAccountWithLots($user->id);

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/lots?status=open");

        $response->assertOk();
        $data = $response->json();
        $this->assertCount(2, $data['lots']);
        $this->assertNull($data['summary']); // No summary for open lots
        $this->assertContains(2025, $data['closedYears']);
    }

    public function test_listing_closed_lots_with_year(): void
    {
        $user = $this->createAdminUser();
        $acctId = $this->createAccountWithLots($user->id);

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/lots?status=closed&year=2025");

        $response->assertOk();
        $data = $response->json();
        $this->assertCount(2, $data['lots']); // MSFT (ST) and AMZN (LT)
        $this->assertNotNull($data['summary']);
        $this->assertEquals(1000.00, $data['summary']['short_term_gains']);
        $this->assertEquals(-1000.00, $data['summary']['long_term_losses']);
        $this->assertEquals(0, $data['summary']['total_realized']);
    }

    public function test_create_lot_manually(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Account',
            'acct_last_balance' => '0',
        ]);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/lots", [
            'symbol' => 'TSLA',
            'description' => 'Tesla Inc.',
            'quantity' => 10,
            'purchase_date' => '2025-01-01',
            'cost_basis' => 2500.00,
            'cost_per_unit' => 250.00,
        ]);

        $response->assertStatus(201);
        $response->assertJson(['success' => true]);
        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $acctId,
            'symbol' => 'TSLA',
            'lot_source' => 'manual',
        ]);
    }

    public function test_create_closed_lot_computes_short_term(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Account',
            'acct_last_balance' => '0',
        ]);

        // Short-term: held for 6 months
        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/lots", [
            'symbol' => 'TSLA',
            'quantity' => 10,
            'purchase_date' => '2025-01-01',
            'cost_basis' => 2500.00,
            'sale_date' => '2025-07-01',
            'proceeds' => 3000.00,
        ]);

        $response->assertStatus(201);
        $lot = FinAccountLot::where('acct_id', $acctId)->first();
        $this->assertTrue($lot->is_short_term);
        $this->assertEquals(500.00, (float) $lot->realized_gain_loss);
    }

    public function test_create_closed_lot_computes_long_term(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Account',
            'acct_last_balance' => '0',
        ]);

        // Long-term: held for 2 years
        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/lots", [
            'symbol' => 'AAPL',
            'quantity' => 10,
            'purchase_date' => '2023-01-01',
            'cost_basis' => 1500.00,
            'sale_date' => '2025-06-01',
            'proceeds' => 2000.00,
        ]);

        $response->assertStatus(201);
        $lot = FinAccountLot::where('acct_id', $acctId)->first();
        $this->assertFalse($lot->is_short_term);
        $this->assertEquals(500.00, (float) $lot->realized_gain_loss);
    }

    public function test_cannot_see_other_users_lots(): void
    {
        $owner = $this->createUser();
        $otherUser = $this->createUser();
        $acctId = $this->createAccountWithLots($owner->id);

        $response = $this->actingAs($otherUser)->getJson("/api/finance/{$acctId}/lots?status=open");

        $response->assertStatus(404);
    }

    public function test_requires_authentication(): void
    {
        $response = $this->getJson('/api/finance/1/lots?status=open');
        $response->assertUnauthorized();
    }

    public function test_import_lots_creates_new_lots(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Import',
            'acct_last_balance' => '0',
        ]);

        // Create buy and sell transactions
        $buyTId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId,
            't_date' => '2024-12-19',
            't_type' => 'Buy',
            't_symbol' => 'ARKG',
            't_qty' => 0.101,
            't_amt' => -2.25,
            'when_added' => now(),
        ]);
        $sellTId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId,
            't_date' => '2025-05-06',
            't_type' => 'Sell',
            't_symbol' => 'ARKG',
            't_qty' => -0.101,
            't_amt' => 2.06,
            'when_added' => now(),
        ]);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/lots/import", [
            'lots' => [
                [
                    'symbol' => 'ARKG',
                    'description' => 'ISHARES TR GENOMICS IMMUN',
                    'quantity' => 0.101,
                    'purchase_date' => '2024-12-19',
                    'cost_basis' => 2.25,
                    'cost_per_unit' => 22.28,
                    'sale_date' => '2025-05-06',
                    'proceeds' => 2.06,
                    'realized_gain_loss' => -0.19,
                    'is_short_term' => true,
                    'open_t_id' => $buyTId,
                    'close_t_id' => $sellTId,
                ],
            ],
        ]);

        $response->assertOk();
        $response->assertJson(['success' => true, 'created' => 1, 'updated' => 0]);

        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $acctId,
            'symbol' => 'ARKG',
            'open_t_id' => $buyTId,
            'close_t_id' => $sellTId,
            'lot_source' => 'fidelity_import',
        ]);
    }

    public function test_import_lots_updates_existing_open_lot(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Import Update',
            'acct_last_balance' => '0',
        ]);

        // Create an existing open lot
        FinAccountLot::create([
            'acct_id' => $acctId,
            'symbol' => 'ARKG',
            'quantity' => 0.101,
            'purchase_date' => '2024-12-19',
            'cost_basis' => 2.25,
            'lot_source' => 'fidelity_import',
        ]);

        $sellTId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId,
            't_date' => '2025-05-06',
            't_type' => 'Sell',
            't_symbol' => 'ARKG',
            't_qty' => -0.101,
            't_amt' => 2.06,
            'when_added' => now(),
        ]);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/lots/import", [
            'lots' => [
                [
                    'symbol' => 'ARKG',
                    'quantity' => 0.101,
                    'purchase_date' => '2024-12-19',
                    'cost_basis' => 2.25,
                    'sale_date' => '2025-05-06',
                    'proceeds' => 2.06,
                    'realized_gain_loss' => -0.19,
                    'is_short_term' => true,
                    'close_t_id' => $sellTId,
                ],
            ],
        ]);

        $response->assertOk();
        $response->assertJson(['success' => true, 'created' => 0, 'updated' => 1]);

        $lot = FinAccountLot::where('acct_id', $acctId)->first();
        $this->assertEquals('2025-05-06', $lot->sale_date->format('Y-m-d'));
        $this->assertEquals($sellTId, $lot->close_t_id);
    }

    public function test_search_transactions_returns_matching(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Search',
            'acct_last_balance' => '0',
        ]);

        DB::table('fin_account_line_items')->insert([
            ['t_account' => $acctId, 't_date' => '2024-12-19', 't_type' => 'Buy', 't_symbol' => 'ARKG', 't_qty' => 0.101, 't_amt' => -2.25, 'when_added' => now()],
            ['t_account' => $acctId, 't_date' => '2025-05-06', 't_type' => 'Sell', 't_symbol' => 'ARKG', 't_qty' => -0.101, 't_amt' => 2.06, 'when_added' => now()],
            ['t_account' => $acctId, 't_date' => '2025-01-15', 't_type' => 'Dividend', 't_symbol' => 'ARKG', 't_qty' => 0, 't_amt' => 0.50, 'when_added' => now()],
        ]);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/lots/search-transactions", [
            'dates' => ['2024-12-19', '2025-05-06'],
        ]);

        $response->assertOk();
        $transactions = $response->json('transactions');
        $this->assertCount(2, $transactions);
    }

    public function test_lots_by_transaction(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Lots By Txn',
            'acct_last_balance' => '0',
        ]);

        $buyTId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId, 't_date' => '2024-01-15', 't_type' => 'Buy', 't_symbol' => 'AAPL', 't_qty' => 10, 't_amt' => -1500, 'when_added' => now(),
        ]);

        FinAccountLot::create([
            'acct_id' => $acctId,
            'symbol' => 'AAPL',
            'quantity' => 10,
            'purchase_date' => '2024-01-15',
            'cost_basis' => 1500.00,
            'open_t_id' => $buyTId,
            'lot_source' => 'manual',
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/lots/by-transaction/{$buyTId}");

        $response->assertOk();
        $lots = $response->json('lots');
        $this->assertCount(1, $lots);
        $this->assertEquals('AAPL', $lots[0]['symbol']);
    }

    public function test_delete_transaction_unlinks_lots(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Unlink',
            'acct_last_balance' => '0',
        ]);

        $buyTId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId, 't_date' => '2024-01-15', 't_type' => 'Buy', 't_symbol' => 'AAPL', 't_qty' => 10, 't_amt' => -1500, 'when_added' => now(),
        ]);

        $lot = FinAccountLot::create([
            'acct_id' => $acctId,
            'symbol' => 'AAPL',
            'quantity' => 10,
            'purchase_date' => '2024-01-15',
            'cost_basis' => 1500.00,
            'open_t_id' => $buyTId,
            'lot_source' => 'manual',
        ]);

        // Delete the transaction
        $response = $this->actingAs($user)->deleteJson("/api/finance/{$acctId}/line_items", [
            't_id' => $buyTId,
        ]);

        $response->assertOk();

        // Lot should still exist but open_t_id should be null
        $lot->refresh();
        $this->assertNull($lot->open_t_id);
        $this->assertDatabaseHas('fin_account_lots', ['lot_id' => $lot->lot_id]);
    }

    public function test_merge_transactions_reassigns_lots(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Merge Lots',
            'acct_last_balance' => '0',
        ]);

        // Create two "duplicate" transactions
        $t1Id = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId, 't_date' => '2024-01-15', 't_type' => 'Buy', 't_symbol' => 'AAPL', 't_qty' => 10, 't_amt' => -1500, 't_description' => 'Buy AAPL', 'when_added' => now(),
        ]);
        $t2Id = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId, 't_date' => '2024-01-15', 't_type' => 'Buy', 't_symbol' => 'AAPL', 't_qty' => 10, 't_amt' => -1500, 't_description' => 'Buy AAPL', 'when_added' => now(),
        ]);

        // Link lot to older transaction (which will be deleted)
        $lot = FinAccountLot::create([
            'acct_id' => $acctId,
            'symbol' => 'AAPL',
            'quantity' => 10,
            'purchase_date' => '2024-01-15',
            'cost_basis' => 1500.00,
            'open_t_id' => $t1Id,
            'lot_source' => 'manual',
        ]);

        // Merge: keep t2, delete t1
        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/merge-duplicates", [
            'merges' => [
                ['keepId' => $t2Id, 'deleteIds' => [$t1Id]],
            ],
        ]);

        $response->assertOk();

        // Lot's open_t_id should now point to t2Id (kept transaction)
        $lot->refresh();
        $this->assertEquals($t2Id, $lot->open_t_id);
    }

    public function test_create_lot_with_transaction_ids(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Lot Links',
            'acct_last_balance' => '0',
        ]);

        $buyTId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId, 't_date' => '2025-01-01', 't_type' => 'Buy', 't_symbol' => 'TSLA', 't_qty' => 10, 't_amt' => -2500, 'when_added' => now(),
        ]);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/lots", [
            'symbol' => 'TSLA',
            'quantity' => 10,
            'purchase_date' => '2025-01-01',
            'cost_basis' => 2500.00,
            'open_t_id' => $buyTId,
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $acctId,
            'symbol' => 'TSLA',
            'open_t_id' => $buyTId,
        ]);
    }

    public function test_save_analyzed_lots(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Analyzer Save',
            'acct_last_balance' => '0',
        ]);

        $buyTId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId, 't_date' => '2024-01-15', 't_type' => 'Buy', 't_symbol' => 'AAPL', 't_qty' => 100, 't_amt' => -15000, 'when_added' => now(),
        ]);
        $sellTId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId, 't_date' => '2024-06-15', 't_type' => 'Sell', 't_symbol' => 'AAPL', 't_qty' => -100, 't_amt' => 17000, 'when_added' => now(),
        ]);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/lots/save-analyzed", [
            'lots' => [
                [
                    'symbol' => 'AAPL',
                    'description' => '100 sh. AAPL',
                    'quantity' => 100,
                    'purchase_date' => '2024-01-15',
                    'cost_basis' => 15000.00,
                    'sale_date' => '2024-06-15',
                    'proceeds' => 17000.00,
                    'realized_gain_loss' => 2000.00,
                    'is_short_term' => true,
                    'open_t_id' => $buyTId,
                    'close_t_id' => $sellTId,
                ],
            ],
        ]);

        $response->assertOk();
        $response->assertJson(['success' => true, 'created' => 1]);

        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $acctId,
            'symbol' => 'AAPL',
            'lot_source' => 'analyzer',
            'open_t_id' => $buyTId,
            'close_t_id' => $sellTId,
        ]);
    }

    public function test_save_analyzed_lots_replaces_previous_analyzer_lots(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Analyzer Replace',
            'acct_last_balance' => '0',
        ]);

        // Create an existing analyzer lot
        FinAccountLot::create([
            'acct_id' => $acctId,
            'symbol' => 'OLD',
            'quantity' => 10,
            'purchase_date' => '2024-01-01',
            'cost_basis' => 100.00,
            'lot_source' => 'analyzer',
        ]);

        // Also create a manual lot (should not be deleted)
        FinAccountLot::create([
            'acct_id' => $acctId,
            'symbol' => 'MANUAL',
            'quantity' => 5,
            'purchase_date' => '2024-01-01',
            'cost_basis' => 50.00,
            'lot_source' => 'manual',
        ]);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/lots/save-analyzed", [
            'lots' => [
                [
                    'symbol' => 'NEW',
                    'quantity' => 20,
                    'purchase_date' => '2024-03-01',
                    'cost_basis' => 200.00,
                ],
            ],
        ]);

        $response->assertOk();

        // Old analyzer lot should be gone
        $this->assertDatabaseMissing('fin_account_lots', [
            'acct_id' => $acctId,
            'symbol' => 'OLD',
            'lot_source' => 'analyzer',
        ]);

        // Manual lot should still exist
        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $acctId,
            'symbol' => 'MANUAL',
            'lot_source' => 'manual',
        ]);

        // New analyzer lot should exist
        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $acctId,
            'symbol' => 'NEW',
            'lot_source' => 'analyzer',
        ]);
    }

    public function test_update_lot(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Update Lot',
            'acct_last_balance' => '0',
        ]);

        $buyTId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId, 't_date' => '2024-01-15', 't_type' => 'Buy', 't_symbol' => 'AAPL', 't_qty' => 100, 't_amt' => -15000, 'when_added' => now(),
        ]);

        $lot = FinAccountLot::create([
            'acct_id' => $acctId,
            'symbol' => 'AAPL',
            'quantity' => 100,
            'purchase_date' => '2024-01-15',
            'cost_basis' => 15000.00,
            'lot_source' => 'analyzer',
        ]);

        $response = $this->actingAs($user)->putJson("/api/finance/{$acctId}/lots/{$lot->lot_id}", [
            'open_t_id' => $buyTId,
            'sale_date' => '2024-06-15',
            'proceeds' => 17000.00,
        ]);

        $response->assertOk();
        $response->assertJson(['success' => true]);

        $lot->refresh();
        $this->assertEquals($buyTId, $lot->open_t_id);
        $this->assertEquals('2024-06-15', $lot->sale_date->format('Y-m-d'));
        $this->assertEquals(2000.00, (float) $lot->realized_gain_loss);
        $this->assertTrue($lot->is_short_term);
    }

    public function test_delete_lot(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Delete Lot',
            'acct_last_balance' => '0',
        ]);

        $lot = FinAccountLot::create([
            'acct_id' => $acctId,
            'symbol' => 'XYZ',
            'quantity' => 10,
            'purchase_date' => '2024-01-01',
            'cost_basis' => 100.00,
            'lot_source' => 'analyzer',
        ]);

        $response = $this->actingAs($user)->deleteJson("/api/finance/{$acctId}/lots/{$lot->lot_id}");

        $response->assertOk();
        $response->assertJson(['success' => true]);
        $this->assertDatabaseMissing('fin_account_lots', ['lot_id' => $lot->lot_id]);
    }

    public function test_one_closing_transaction_multiple_opening_lots(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Multi-Open',
            'acct_last_balance' => '0',
        ]);

        $buy1 = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId, 't_date' => '2024-01-15', 't_type' => 'Buy', 't_symbol' => 'AAPL', 't_qty' => 50, 't_amt' => -7500, 'when_added' => now(),
        ]);
        $buy2 = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId, 't_date' => '2024-02-15', 't_type' => 'Buy', 't_symbol' => 'AAPL', 't_qty' => 50, 't_amt' => -8000, 'when_added' => now(),
        ]);
        $sell = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId, 't_date' => '2024-06-15', 't_type' => 'Sell', 't_symbol' => 'AAPL', 't_qty' => -100, 't_amt' => 17000, 'when_added' => now(),
        ]);

        // Save two lots referencing the same close_t_id but different open_t_ids
        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/lots/save-analyzed", [
            'lots' => [
                [
                    'symbol' => 'AAPL',
                    'quantity' => 50,
                    'purchase_date' => '2024-01-15',
                    'cost_basis' => 7500.00,
                    'sale_date' => '2024-06-15',
                    'proceeds' => 8500.00,
                    'is_short_term' => true,
                    'open_t_id' => $buy1,
                    'close_t_id' => $sell,
                ],
                [
                    'symbol' => 'AAPL',
                    'quantity' => 50,
                    'purchase_date' => '2024-02-15',
                    'cost_basis' => 8000.00,
                    'sale_date' => '2024-06-15',
                    'proceeds' => 8500.00,
                    'is_short_term' => true,
                    'open_t_id' => $buy2,
                    'close_t_id' => $sell,
                ],
            ],
        ]);

        $response->assertOk();
        $response->assertJson(['success' => true, 'created' => 2]);

        // Both lots reference the same sale transaction
        $lots = FinAccountLot::where('acct_id', $acctId)->where('close_t_id', $sell)->get();
        $this->assertCount(2, $lots);
        $openIds = $lots->pluck('open_t_id')->sort()->values()->toArray();
        $this->assertEquals([$buy1, $buy2], $openIds);
    }

    public function test_search_opening_transactions_by_symbol(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Search Opening',
            'acct_last_balance' => '0',
        ]);

        DB::table('fin_account_line_items')->insert([
            ['t_account' => $acctId, 't_date' => '2024-01-15', 't_type' => 'Buy', 't_symbol' => 'AAPL', 't_qty' => 100, 't_amt' => -15000, 'when_added' => now()],
            ['t_account' => $acctId, 't_date' => '2024-06-15', 't_type' => 'Sell', 't_symbol' => 'AAPL', 't_qty' => -100, 't_amt' => 17000, 'when_added' => now()],
            ['t_account' => $acctId, 't_date' => '2024-02-01', 't_type' => 'Buy', 't_symbol' => 'GOOG', 't_qty' => 50, 't_amt' => -7500, 'when_added' => now()],
        ]);

        $response = $this->actingAs($user)->postJson('/api/finance/lots/search-opening', [
            'symbol' => 'AAPL',
            'type' => 'buy',
        ]);

        $response->assertOk();
        $transactions = $response->json('transactions');
        // Should only return AAPL buys, not sells or GOOG buys
        $this->assertCount(1, $transactions);
        $this->assertEquals('AAPL', $transactions[0]['t_symbol']);
        $this->assertEquals('Buy', $transactions[0]['t_type']);
    }

    public function test_save_lot_assignment_manually(): void
    {
        $user = $this->createAdminUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Manual Assignment',
            'acct_last_balance' => '0',
        ]);

        $buyTId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId, 't_date' => '2024-01-15', 't_type' => 'Buy', 't_symbol' => 'AAPL', 't_qty' => 100, 't_amt' => -15000, 'when_added' => now(),
        ]);
        $sellTId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId, 't_date' => '2024-06-15', 't_type' => 'Sell', 't_symbol' => 'AAPL', 't_qty' => -100, 't_amt' => 17000, 'when_added' => now(),
        ]);

        $response = $this->actingAs($user)->postJson('/api/finance/lots/save-assignment', [
            'assignments' => [
                [
                    'close_t_id' => $sellTId,
                    'open_t_id' => $buyTId,
                    'symbol' => 'AAPL',
                    'quantity' => 100,
                    'purchase_date' => '2024-01-15',
                    'cost_basis' => 15000.00,
                    'sale_date' => '2024-06-15',
                    'proceeds' => 17000.00,
                ],
            ],
        ]);

        $response->assertOk();
        $response->assertJson(['success' => true, 'created' => 1]);

        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $acctId,
            'symbol' => 'AAPL',
            'lot_source' => 'manual',
            'open_t_id' => $buyTId,
            'close_t_id' => $sellTId,
        ]);
    }

    public function test_search_opening_requires_auth(): void
    {
        $response = $this->postJson('/api/finance/lots/search-opening', [
            'symbol' => 'AAPL',
        ]);
        $response->assertUnauthorized();
    }

    public function test_save_assignment_requires_auth(): void
    {
        $response = $this->postJson('/api/finance/lots/save-assignment', [
            'assignments' => [],
        ]);
        $response->assertUnauthorized();
    }
}
