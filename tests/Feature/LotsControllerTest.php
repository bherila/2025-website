<?php

namespace Tests\Feature;

use App\Models\FinAccountLot;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LotsControllerTest extends TestCase
{
    use RefreshDatabase;

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
}
