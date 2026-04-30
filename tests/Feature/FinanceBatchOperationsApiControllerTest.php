<?php

namespace Tests\Feature;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceBatchOperationsApiControllerTest extends TestCase
{
    use RefreshDatabase;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function createAccountWithTransactions(int $userId, int $count = 3): FinAccounts
    {
        $this->actingAs(User::find($userId));

        $account = FinAccounts::create([
            'acct_name' => 'Test Account',
            'acct_currency' => 'USD',
            'acct_type' => 'Asset',
        ]);

        for ($i = 1; $i <= $count; $i++) {
            FinAccountLineItems::create([
                't_account' => $account->acct_id,
                't_date' => '2024-01-0'.$i,
                't_amt' => $i * 100,
                't_description' => "Transaction $i",
                't_type' => 'BUY',
            ]);
        }

        return $account;
    }

    // -------------------------------------------------------------------------
    // POST /api/finance/transactions/batch-delete
    // -------------------------------------------------------------------------

    public function test_batch_delete_requires_auth(): void
    {
        $response = $this->postJson('/api/finance/transactions/batch-delete', ['t_ids' => [1]]);
        $response->assertStatus(401);
    }

    public function test_batch_delete_deletes_multiple_transactions(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id, 3);
        $ids = FinAccountLineItems::where('t_account', $account->acct_id)->pluck('t_id')->toArray();

        $response = $this->actingAs($user)->postJson('/api/finance/transactions/batch-delete', [
            't_ids' => $ids,
        ]);

        $response->assertOk()->assertJson(['success' => true, 'deleted' => 3]);
        $this->assertDatabaseCount('fin_account_line_items', 0);
    }

    public function test_batch_delete_returns_count_of_deleted(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id, 5);
        $ids = FinAccountLineItems::where('t_account', $account->acct_id)
            ->limit(2)
            ->pluck('t_id')
            ->toArray();

        $response = $this->actingAs($user)->postJson('/api/finance/transactions/batch-delete', [
            't_ids' => $ids,
        ]);

        $response->assertOk()->assertJson(['success' => true, 'deleted' => 2]);
        $this->assertDatabaseCount('fin_account_line_items', 3);
    }

    public function test_batch_delete_fails_for_other_users_transactions(): void
    {
        $owner = $this->createUser();
        $attacker = $this->createUser();

        $account = $this->createAccountWithTransactions($owner->id, 2);
        $ids = FinAccountLineItems::where('t_account', $account->acct_id)->pluck('t_id')->toArray();

        $response = $this->actingAs($attacker)->postJson('/api/finance/transactions/batch-delete', [
            't_ids' => $ids,
        ]);

        // Should succeed (200) but delete 0 rows — the attacker's accounts don't own these
        $response->assertOk()->assertJson(['deleted' => 0]);
        $this->assertDatabaseCount('fin_account_line_items', 2);
    }


    public function test_batch_delete_does_not_unlink_other_users_lots(): void
    {
        $owner = $this->createUser();
        $attacker = $this->createUser();

        $ownerAccount = $this->createAccountWithTransactions($owner->id, 1);
        $ownerTransactionId = FinAccountLineItems::where('t_account', $ownerAccount->acct_id)->value('t_id');

        $ownerLot = FinAccountLot::create([
            'acct_id' => $ownerAccount->acct_id,
            'symbol' => 'AAPL',
            'quantity' => 1,
            'purchase_date' => '2024-01-01',
            'cost_basis' => 100,
            'cost_per_unit' => 100,
            'open_t_id' => $ownerTransactionId,
        ]);

        $response = $this->actingAs($attacker)->postJson('/api/finance/transactions/batch-delete', [
            't_ids' => [$ownerTransactionId],
        ]);

        $response->assertOk()->assertJson(['deleted' => 0]);

        $this->assertDatabaseHas('fin_account_lots', [
            'lot_id' => $ownerLot->lot_id,
            'open_t_id' => $ownerTransactionId,
        ]);
    }

    public function test_batch_delete_requires_t_ids_array(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/finance/transactions/batch-delete', []);
        $response->assertStatus(422);
    }

    public function test_batch_delete_rejects_empty_array(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/finance/transactions/batch-delete', [
            't_ids' => [],
        ]);
        $response->assertStatus(422);
    }

    public function test_batch_delete_rejects_more_than_1000_ids(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/finance/transactions/batch-delete', [
            't_ids' => range(1, 1001),
        ]);
        $response->assertStatus(422);
    }

    // -------------------------------------------------------------------------
    // POST /api/finance/transactions/batch-update
    // -------------------------------------------------------------------------

    public function test_batch_update_requires_auth(): void
    {
        $response = $this->postJson('/api/finance/transactions/batch-update', [
            't_ids' => [1],
            'fields' => ['t_type' => 'SELL'],
        ]);
        $response->assertStatus(401);
    }

    public function test_batch_update_sets_field_on_multiple_rows(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id, 3);
        $ids = FinAccountLineItems::where('t_account', $account->acct_id)->pluck('t_id')->toArray();

        $response = $this->actingAs($user)->postJson('/api/finance/transactions/batch-update', [
            't_ids' => $ids,
            'fields' => ['t_schc_category' => 'Office'],
        ]);

        $response->assertOk()->assertJson(['success' => true, 'updated' => 3]);
        $this->assertEquals(3, FinAccountLineItems::where('t_schc_category', 'Office')->count());
    }

    public function test_batch_update_can_set_type_and_memo(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id, 2);
        $ids = FinAccountLineItems::where('t_account', $account->acct_id)->pluck('t_id')->toArray();

        $response = $this->actingAs($user)->postJson('/api/finance/transactions/batch-update', [
            't_ids' => $ids,
            'fields' => ['t_type' => 'SELL', 't_comment' => 'bulk update'],
        ]);

        $response->assertOk()->assertJson(['success' => true]);
        $this->assertEquals(2, FinAccountLineItems::where('t_type', 'SELL')
            ->where('t_comment', 'bulk update')
            ->count());
    }

    public function test_batch_update_ignores_non_whitelisted_fields(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id, 1);
        $id = FinAccountLineItems::where('t_account', $account->acct_id)->value('t_id');

        $response = $this->actingAs($user)->postJson('/api/finance/transactions/batch-update', [
            't_ids' => [$id],
            'fields' => ['t_source' => 'hacked'],   // not in whitelist
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseMissing('fin_account_line_items', ['t_source' => 'hacked', 't_id' => $id]);
    }

    public function test_batch_update_fails_for_other_users_transactions(): void
    {
        $owner = $this->createUser();
        $attacker = $this->createUser();

        $account = $this->createAccountWithTransactions($owner->id, 2);
        $ids = FinAccountLineItems::where('t_account', $account->acct_id)->pluck('t_id')->toArray();

        $response = $this->actingAs($attacker)->postJson('/api/finance/transactions/batch-update', [
            't_ids' => $ids,
            'fields' => ['t_type' => 'SELL'],
        ]);

        $response->assertOk()->assertJson(['updated' => 0]);
        $this->assertEquals(0, FinAccountLineItems::where('t_type', 'SELL')->count());
    }

    public function test_batch_update_requires_fields(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/finance/transactions/batch-update', [
            't_ids' => [1],
        ]);
        $response->assertStatus(422);
    }

    public function test_batch_update_rejects_empty_t_ids(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/finance/transactions/batch-update', [
            't_ids' => [],
            'fields' => ['t_type' => 'SELL'],
        ]);
        $response->assertStatus(422);
    }

    public function test_batch_update_rejects_more_than_1000_ids(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/finance/transactions/batch-update', [
            't_ids' => range(1, 1001),
            'fields' => ['t_type' => 'SELL'],
        ]);
        $response->assertStatus(422);
    }

    public function test_batch_update_can_set_all_whitelisted_fields(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id, 1);
        $id = FinAccountLineItems::where('t_account', $account->acct_id)->value('t_id');

        $response = $this->actingAs($user)->postJson('/api/finance/transactions/batch-update', [
            't_ids' => [$id],
            'fields' => [
                't_date' => '2024-12-25',
                't_type' => 'SELL',
                't_amt' => 1500.50,
                't_comment' => 'Updated comment',
                't_description' => 'Updated description',
                't_qty' => 25,
                't_price' => 60.02,
                't_commission' => 5.00,
                't_fee' => 2.50,
                't_symbol' => 'MSFT',
                't_schc_category' => 'Office',
            ],
        ]);

        $response->assertOk()->assertJson(['success' => true, 'updated' => 1]);

        $transaction = FinAccountLineItems::find($id);
        $this->assertEquals('2024-12-25', $transaction->t_date);
        $this->assertEquals('SELL', $transaction->t_type);
        $this->assertEquals(1500.50, $transaction->t_amt);
        $this->assertEquals('Updated comment', $transaction->t_comment);
        $this->assertEquals('Updated description', $transaction->t_description);
        $this->assertEquals(25, $transaction->t_qty);
        $this->assertEquals(60.02, $transaction->t_price);
        $this->assertEquals(5.00, $transaction->t_commission);
        $this->assertEquals(2.50, $transaction->t_fee);
        $this->assertEquals('MSFT', $transaction->t_symbol);
        $this->assertEquals('Office', $transaction->t_schc_category);
    }
}
