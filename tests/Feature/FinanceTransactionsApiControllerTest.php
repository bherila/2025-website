<?php

namespace Tests\Feature;

use App\Jobs\LotsMatchJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItemDeletion;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinStatement;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class FinanceTransactionsApiControllerTest extends TestCase
{
    // -------------------------------------------------------------------------
    // Helper: create an account and some transactions for a user
    // -------------------------------------------------------------------------

    private function createAccountWithTransactions(int $userId, string $accountName = 'Checking'): FinAccounts
    {
        $this->actingAs(User::find($userId));

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

    public function test_sync_line_items_bootstraps_active_transactions(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);

        $response = $this->actingAs($user)->getJson("/api/finance/{$account->acct_id}/line_items/sync");

        $response->assertOk()
            ->assertJsonStructure([
                'server_time',
                'transactions',
                'deleted',
            ]);
        $this->assertCount(2, $response->json('transactions'));
        $this->assertSame([], $response->json('deleted'));
    }

    public function test_sync_line_items_returns_only_changes_after_since(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);
        $transactions = FinAccountLineItems::where('t_account', $account->acct_id)->orderBy('t_id')->get();
        $since = CarbonImmutable::parse('2026-05-03 10:00:00');

        DB::table('fin_account_line_items')
            ->where('t_id', $transactions[0]->t_id)
            ->update(['updated_at' => $since->subMinute()]);
        DB::table('fin_account_line_items')
            ->where('t_id', $transactions[1]->t_id)
            ->update(['updated_at' => $since->addMinute()]);

        $response = $this->actingAs($user)
            ->getJson("/api/finance/{$account->acct_id}/line_items/sync?since=".$since->toISOString());

        $response->assertOk();
        $this->assertCount(1, $response->json('transactions'));
        $this->assertSame($transactions[1]->t_id, $response->json('transactions.0.t_id'));
    }

    public function test_sync_line_items_includes_boundary_timestamp_changes(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);
        $transactions = FinAccountLineItems::where('t_account', $account->acct_id)->orderBy('t_id')->get();
        $since = CarbonImmutable::parse('2026-05-03 10:00:00');

        DB::table('fin_account_line_items')
            ->where('t_id', $transactions[0]->t_id)
            ->update(['updated_at' => $since->subMinute()]);
        DB::table('fin_account_line_items')
            ->where('t_id', $transactions[1]->t_id)
            ->update(['updated_at' => $since]);

        $response = $this->actingAs($user)
            ->getJson("/api/finance/{$account->acct_id}/line_items/sync?since=".$since->toISOString());

        $response->assertOk();
        $this->assertCount(1, $response->json('transactions'));
        $this->assertSame($transactions[1]->t_id, $response->json('transactions.0.t_id'));
    }

    public function test_delete_line_item_writes_tombstone_and_excludes_deleted_row(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);
        $transaction = FinAccountLineItems::where('t_account', $account->acct_id)->firstOrFail();

        $this->actingAs($user)
            ->deleteJson("/api/finance/{$account->acct_id}/line_items", ['t_id' => $transaction->t_id])
            ->assertOk();

        $this->assertDatabaseMissing('fin_account_line_items', ['t_id' => $transaction->t_id]);
        $this->assertDatabaseHas('fin_account_line_item_deletions', [
            't_id' => $transaction->t_id,
            't_account' => $account->acct_id,
            'user_id' => $user->id,
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/{$account->acct_id}/line_items");
        $response->assertOk();
        $this->assertCount(1, $response->json());
    }

    public function test_sync_line_items_returns_tombstones_after_since(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);
        $transaction = FinAccountLineItems::where('t_account', $account->acct_id)->firstOrFail();
        $since = CarbonImmutable::parse('2026-05-03 10:00:00');

        DB::table('fin_account_line_items')
            ->where('t_account', $account->acct_id)
            ->update(['updated_at' => $since->subMinute()]);

        FinAccountLineItemDeletion::create([
            't_id' => $transaction->t_id,
            't_account' => $account->acct_id,
            'user_id' => $user->id,
            'deleted_at' => $since->addMinute(),
        ]);
        $transaction->delete();

        $response = $this->actingAs($user)
            ->getJson("/api/finance/{$account->acct_id}/line_items/sync?since=".$since->toISOString());

        $response->assertOk();
        $this->assertSame([], $response->json('transactions'));
        $this->assertCount(1, $response->json('deleted'));
        $this->assertSame($transaction->t_id, $response->json('deleted.0.t_id'));
    }

    public function test_sync_line_items_includes_boundary_timestamp_tombstones(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);
        $transaction = FinAccountLineItems::where('t_account', $account->acct_id)->firstOrFail();
        $since = CarbonImmutable::parse('2026-05-03 10:00:00');

        DB::table('fin_account_line_items')
            ->where('t_account', $account->acct_id)
            ->update(['updated_at' => $since->subMinute()]);

        FinAccountLineItemDeletion::create([
            't_id' => $transaction->t_id,
            't_account' => $account->acct_id,
            'user_id' => $user->id,
            'deleted_at' => $since,
        ]);
        $transaction->delete();

        $response = $this->actingAs($user)
            ->getJson("/api/finance/{$account->acct_id}/line_items/sync?since=".$since->toISOString());

        $response->assertOk();
        $this->assertSame([], $response->json('transactions'));
        $this->assertCount(1, $response->json('deleted'));
        $this->assertSame($transaction->t_id, $response->json('deleted.0.t_id'));
    }

    public function test_all_account_sync_is_scoped_to_authenticated_user(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();
        $this->createAccountWithTransactions($user->id, 'Mine');
        $this->createAccountWithTransactions($otherUser->id, 'Theirs');

        $response = $this->actingAs($user)->getJson('/api/finance/all/line_items/sync');

        $response->assertOk();
        $this->assertCount(2, $response->json('transactions'));
    }

    public function test_import_line_items_skips_duplicates(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);

        $payload = [
            'transactions' => [
                [
                    't_date' => '2026-05-03',
                    't_amt' => 42.00,
                    't_type' => 'deposit',
                    't_description' => 'API deposit',
                ],
            ],
        ];

        $this->actingAs($user)->postJson("/api/finance/{$account->acct_id}/line_items", $payload)
            ->assertOk()
            ->assertJsonPath('imported', 1)
            ->assertJsonPath('skipped_duplicate', 0);

        $this->actingAs($user)->postJson("/api/finance/{$account->acct_id}/line_items", $payload)
            ->assertOk()
            ->assertJsonPath('imported', 0)
            ->assertJsonPath('skipped_duplicate', 1);

        $this->assertSame(1, FinAccountLineItems::query()
            ->where('t_account', $account->acct_id)
            ->where('t_date', '2026-05-03')
            ->where('t_amt', 42.00)
            ->count());
    }

    public function test_import_line_items_queues_lot_matcher_once_for_affected_year(): void
    {
        Queue::fake();
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);
        $document = $this->createBrokerDocument($user->id, (int) $account->acct_id, 2026);

        $this->actingAs($user)->postJson("/api/finance/{$account->acct_id}/line_items", [
            'transactions' => [
                [
                    't_date' => '2026-05-03',
                    't_amt' => 42.00,
                    't_type' => 'deposit',
                    't_description' => 'API deposit',
                ],
                [
                    't_date' => '2026-06-03',
                    't_amt' => 25.00,
                    't_type' => 'deposit',
                    't_description' => 'Second API deposit',
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('imported', 2);

        Queue::assertPushed(
            LotsMatchJob::class,
            fn (LotsMatchJob $job): bool => $job->documentId === (int) $document->document_id,
        );
        Queue::assertPushed(LotsMatchJob::class, 1);
    }

    public function test_import_line_items_normalizes_decimal_amounts_for_duplicate_detection(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);

        FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2026-05-03',
            't_amt' => '42.0000',
            't_type' => 'deposit',
            't_symbol' => null,
            't_description' => 'Existing API deposit',
        ]);

        $this->actingAs($user)->postJson("/api/finance/{$account->acct_id}/line_items", [
            'transactions' => [
                [
                    't_date' => '2026-05-03',
                    't_amt' => 42,
                    't_type' => 'deposit',
                    't_description' => 'API deposit',
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('imported', 0)
            ->assertJsonPath('skipped_duplicate', 1);
    }

    public function test_import_line_items_rejects_statement_id_from_another_account(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);
        $otherAccount = $this->createAccountWithTransactions($user->id, 'Savings');
        $otherStatement = FinStatement::create([
            'acct_id' => $otherAccount->acct_id,
            'balance' => 100,
            'statement_opening_date' => '2026-05-01',
            'statement_closing_date' => '2026-05-31',
        ]);

        $this->actingAs($user)->postJson("/api/finance/{$account->acct_id}/line_items", [
            'transactions' => [
                [
                    't_date' => '2026-05-03',
                    't_amt' => 42,
                    't_type' => 'deposit',
                    'statement_id' => $otherStatement->statement_id,
                ],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonPath('success', false);

        $this->assertDatabaseMissing('fin_account_line_items', [
            't_account' => $account->acct_id,
            't_date' => '2026-05-03',
            't_amt' => 42,
        ]);
    }

    public function test_import_line_items_forces_rows_to_url_account(): void
    {
        $user = $this->createUser();
        $account = $this->createAccountWithTransactions($user->id);
        $otherAccount = $this->createAccountWithTransactions($user->id, 'Savings');

        $this->actingAs($user)->postJson("/api/finance/{$account->acct_id}/line_items", [
            'transactions' => [
                [
                    't_account' => $otherAccount->acct_id,
                    't_date' => '2026-05-03',
                    't_amt' => 42,
                    't_type' => 'deposit',
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('imported', 1);

        $this->assertDatabaseHas('fin_account_line_items', [
            't_account' => $account->acct_id,
            't_date' => '2026-05-03',
            't_amt' => 42,
        ]);
        $this->assertDatabaseMissing('fin_account_line_items', [
            't_account' => $otherAccount->acct_id,
            't_date' => '2026-05-03',
            't_amt' => 42,
        ]);
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

    private function createBrokerDocument(int $userId, int $accountId, int $taxYear): FileForTaxDocument
    {
        $document = app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $userId,
            'tax_year' => $taxYear,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => 'broker-1099.pdf',
            's3_path' => "tax_docs/{$userId}/broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
        ]);

        TaxDocumentAccount::createLink((int) $document->id, $accountId, '1099_b', $taxYear, isReviewed: true);

        return $document;
    }
}
