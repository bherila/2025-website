<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FinanceStatementControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_import_pdf_statement_truncates_dates(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'X',
            'acct_last_balance' => '0',
        ]);

        $payload = [
            'statementInfo' => [
                'periodStart' => '2025-01-01T12:34:56Z',
                'periodEnd' => '2025-01-31T23:59:59-05:00',
                'closingBalance' => 1234.56,
            ],
            'statementDetails' => [],
        ];

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/import-pdf-statement", $payload);
        $response->assertOk();

        $this->assertDatabaseHas('fin_statements', [
            'acct_id' => $acctId,
            'statement_closing_date' => '2025-01-31',
        ]);
    }

    public function test_import_multi_account_pdf_creates_statements_for_each_account(): void
    {
        $user = $this->createAdminUser();

        $acctId1 = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Savings',
            'acct_number' => '123456781234',
            'acct_last_balance' => '0',
        ]);
        $acctId2 = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Checking',
            'acct_number' => '987654325678',
            'acct_last_balance' => '0',
        ]);

        $payload = [
            'accounts' => [
                [
                    'acct_id' => $acctId1,
                    'statementInfo' => ['periodStart' => '2025-01-01', 'periodEnd' => '2025-01-31', 'closingBalance' => 5000],
                    'statementDetails' => [],
                    'transactions' => [
                        ['t_date' => '2025-01-10', 't_amt' => 500, 't_description' => 'Deposit'],
                    ],
                    'lots' => [],
                ],
                [
                    'acct_id' => $acctId2,
                    'statementInfo' => ['periodStart' => '2025-01-01', 'periodEnd' => '2025-01-31', 'closingBalance' => 1200],
                    'statementDetails' => [],
                    'transactions' => [
                        ['t_date' => '2025-01-12', 't_amt' => -100, 't_description' => 'Purchase'],
                    ],
                    'lots' => [],
                ],
            ],
        ];

        $response = $this->actingAs($user)->postJson('/api/finance/multi-import-pdf', $payload);
        $response->assertOk();

        $json = $response->json();
        $this->assertTrue($json['success']);
        $this->assertCount(2, $json['accounts']);

        // Verify statements were created for both accounts
        $this->assertDatabaseHas('fin_statements', [
            'acct_id' => $acctId1,
            'statement_closing_date' => '2025-01-31',
        ]);
        $this->assertDatabaseHas('fin_statements', [
            'acct_id' => $acctId2,
            'statement_closing_date' => '2025-01-31',
        ]);

        // Verify transactions were created
        $this->assertDatabaseHas('fin_account_line_items', [
            't_account' => $acctId1,
            't_description' => 'Deposit',
        ]);
        $this->assertDatabaseHas('fin_account_line_items', [
            't_account' => $acctId2,
            't_description' => 'Purchase',
        ]);
    }

    public function test_import_multi_account_pdf_requires_authentication(): void
    {
        $response = $this->postJson('/api/finance/multi-import-pdf', ['accounts' => []]);
        $response->assertUnauthorized();
    }

    public function test_import_multi_account_pdf_rejects_other_users_accounts(): void
    {
        $user1 = $this->createAdminUser();
        $user2 = $this->createUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user2->id,
            'acct_name' => 'Other account',
            'acct_last_balance' => '0',
        ]);

        $payload = [
            'accounts' => [
                [
                    'acct_id' => $acctId,
                    'statementInfo' => ['periodEnd' => '2025-01-31'],
                    'statementDetails' => [],
                    'transactions' => [],
                    'lots' => [],
                ],
            ],
        ];

        $response = $this->actingAs($user1)->postJson('/api/finance/multi-import-pdf', $payload);
        $response->assertStatus(404);
    }

    public function test_account_flags_update_includes_account_number(): void
    {
        $user = $this->createUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Account',
            'acct_last_balance' => '0',
        ]);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/update-flags", [
            'isDebt' => false,
            'isRetirement' => false,
            'acctNumber' => '123456789012',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('fin_accounts', [
            'acct_id' => $acctId,
            'acct_number' => '123456789012',
            'acct_is_debt' => 0,
            'acct_is_retirement' => 0,
        ]);
    }

    public function test_account_flags_update_can_clear_account_number(): void
    {
        $user = $this->createUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Account',
            'acct_number' => '123456789012',
            'acct_last_balance' => '0',
        ]);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/update-flags", [
            'acctNumber' => null,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('fin_accounts', [
            'acct_id' => $acctId,
            'acct_number' => null,
        ]);
    }

    public function test_account_number_included_in_accounts_api_response(): void
    {
        $user = $this->createUser();

        DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Savings',
            'acct_number' => '123456789012',
            'acct_last_balance' => '0',
            'acct_is_debt' => 0,
            'acct_is_retirement' => 0,
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/accounts');
        $response->assertOk();

        $assetAccounts = $response->json('assetAccounts');
        $this->assertNotEmpty($assetAccounts);
        $this->assertEquals('123456789012', $assetAccounts[0]['acct_number']);
    }
}
