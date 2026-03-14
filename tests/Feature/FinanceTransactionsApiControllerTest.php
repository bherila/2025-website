<?php

namespace Tests\Feature;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceTransactionsApiControllerTest extends TestCase
{
    use RefreshDatabase;

    // -------------------------------------------------------------------------
    // Helper: create an account and some transactions for a user
    // -------------------------------------------------------------------------

    private function createAccountWithTransactions(int $userId, string $accountName = 'Checking'): FinAccounts
    {
        $this->actingAs(\App\Models\User::find($userId));

        $account = FinAccounts::create([
            'acct_name' => $accountName,
            'acct_currency' => 'USD',
            'acct_type' => 'Asset',
        ]);

        FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2024-03-01',
            't_amt' => -100.00,
            't_description' => 'Cash purchase',
            't_symbol' => null,
        ]);

        FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2023-06-15',
            't_amt' => 500.00,
            't_description' => 'Stock dividend',
            't_symbol' => 'AAPL',
        ]);

        return $account;
    }

    // -------------------------------------------------------------------------
    // GET /api/finance/{account_id}/line_items  (single account)
    // -------------------------------------------------------------------------

    public function test_get_line_items_for_single_account(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);

        $response = $this->actingAs($user)->getJson("/api/finance/{$account->acct_id}/line_items");

        $response->assertOk();
        $data = $response->json();
        $this->assertIsArray($data);
        $this->assertCount(2, $data);
    }

    public function test_get_line_items_filters_by_year(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);

        $response = $this->actingAs($user)->getJson("/api/finance/{$account->acct_id}/line_items?year=2024");

        $response->assertOk();
        $data = $response->json();
        $this->assertIsArray($data);
        $this->assertCount(1, $data);
        $this->assertStringStartsWith('2024', $data[0]['t_date']);
    }

    public function test_get_line_items_filters_by_stock_filter(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);

        $response = $this->actingAs($user)->getJson("/api/finance/{$account->acct_id}/line_items?filter=stock");

        $response->assertOk();
        $data = $response->json();
        $this->assertIsArray($data);
        $this->assertCount(1, $data);
        $this->assertEquals('AAPL', $data[0]['t_symbol']);
    }

    public function test_get_line_items_filters_by_cash_filter(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);

        $response = $this->actingAs($user)->getJson("/api/finance/{$account->acct_id}/line_items?filter=cash");

        $response->assertOk();
        $data = $response->json();
        $this->assertIsArray($data);
        $this->assertCount(1, $data);
        $this->assertNull($data[0]['t_symbol'] ?? null);
    }

    public function test_get_line_items_returns_404_for_other_user_account(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();
        $account = $this->createAccountWithTransactions($otherUser->id);

        $response = $this->actingAs($user)->getJson("/api/finance/{$account->acct_id}/line_items");

        $response->assertNotFound();
    }

    // -------------------------------------------------------------------------
    // GET /api/finance/all/line_items  (consolidated: all accounts)
    // -------------------------------------------------------------------------

    public function test_get_all_line_items_returns_transactions_from_all_accounts(): void
    {
        $user = $this->createUser();
        $this->createAccountWithTransactions($user->id, 'Account A');
        $this->createAccountWithTransactions($user->id, 'Account B');

        $response = $this->actingAs($user)->getJson('/api/finance/all/line_items');

        $response->assertOk();
        $data = $response->json();
        $this->assertIsArray($data);
        $this->assertCount(4, $data); // 2 transactions × 2 accounts
    }

    public function test_get_all_line_items_excludes_other_users(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();
        $this->createAccountWithTransactions($user->id);
        $this->createAccountWithTransactions($otherUser->id);

        $response = $this->actingAs($user)->getJson('/api/finance/all/line_items');

        $response->assertOk();
        $data = $response->json();
        $this->assertIsArray($data);
        $this->assertCount(2, $data); // only user's own transactions
    }

    public function test_get_all_line_items_filters_by_year(): void
    {
        $user = $this->createUser();
        $this->createAccountWithTransactions($user->id, 'Account A');
        $this->createAccountWithTransactions($user->id, 'Account B');

        $response = $this->actingAs($user)->getJson('/api/finance/all/line_items?year=2024');

        $response->assertOk();
        $data = $response->json();
        $this->assertIsArray($data);
        $this->assertCount(2, $data); // 1 per account in 2024
    }

    public function test_get_all_line_items_filters_by_stock(): void
    {
        $user = $this->createUser();
        $this->createAccountWithTransactions($user->id, 'Account A');
        $this->createAccountWithTransactions($user->id, 'Account B');

        $response = $this->actingAs($user)->getJson('/api/finance/all/line_items?filter=stock');

        $response->assertOk();
        $data = $response->json();
        $this->assertIsArray($data);
        $this->assertCount(2, $data); // 1 stock transaction per account
        foreach ($data as $transaction) {
            $this->assertNotEmpty($transaction['t_symbol']);
        }
    }

    public function test_get_all_line_items_requires_auth(): void
    {
        $response = $this->getJson('/api/finance/all/line_items');
        $response->assertUnauthorized();
    }

    // -------------------------------------------------------------------------
    // GET /api/finance/{account_id}/transaction-years  (single account)
    // -------------------------------------------------------------------------

    public function test_get_transaction_years_for_single_account(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);

        $response = $this->actingAs($user)->getJson("/api/finance/{$account->acct_id}/transaction-years");

        $response->assertOk();
        $years = $response->json();
        $this->assertIsArray($years);
        $this->assertContains(2024, $years);
        $this->assertContains(2023, $years);
    }

    // -------------------------------------------------------------------------
    // GET /api/finance/all/transaction-years  (consolidated: all accounts)
    // -------------------------------------------------------------------------

    public function test_get_all_transaction_years_returns_years_across_accounts(): void
    {
        $user = $this->createUser();
        $this->createAccountWithTransactions($user->id, 'Account A');

        // Add a transaction in a third year for a second account
        $this->actingAs($user);
        $account2 = FinAccounts::create([
            'acct_name' => 'Account B',
            'acct_currency' => 'USD',
            'acct_type' => 'Asset',
        ]);
        FinAccountLineItems::create([
            't_account' => $account2->acct_id,
            't_date' => '2022-11-01',
            't_amt' => -200.00,
            't_description' => 'Old transaction',
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/all/transaction-years');

        $response->assertOk();
        $years = $response->json();
        $this->assertIsArray($years);
        $this->assertContains(2024, $years);
        $this->assertContains(2023, $years);
        $this->assertContains(2022, $years);
    }

    public function test_get_all_transaction_years_excludes_other_users(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();
        $this->createAccountWithTransactions($user->id);

        // Other user has transactions in a different year
        $this->actingAs($otherUser);
        $otherAccount = FinAccounts::create([
            'acct_name' => 'Other Account',
            'acct_currency' => 'USD',
            'acct_type' => 'Asset',
        ]);
        FinAccountLineItems::create([
            't_account' => $otherAccount->acct_id,
            't_date' => '2020-01-01',
            't_amt' => -50.00,
            't_description' => 'Other user transaction',
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/all/transaction-years');

        $response->assertOk();
        $years = $response->json();
        $this->assertNotContains(2020, $years);
    }

    public function test_get_all_transaction_years_requires_auth(): void
    {
        $response = $this->getJson('/api/finance/all/transaction-years');
        $response->assertUnauthorized();
    }
}
