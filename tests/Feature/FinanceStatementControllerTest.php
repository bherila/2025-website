<?php

namespace Tests\Feature;

use App\Models\FinanceTool\FinDocument;
use App\Services\FileStorageService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\TestCase;

class FinanceStatementControllerTest extends TestCase
{
    public function test_cost_basis_algorithm_example1_basic_override(): void
    {
        $user = $this->createUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Account',
            'acct_last_balance' => '0',
        ]);

        // Transactions in ascending date order
        DB::table('fin_account_line_items')->insert([
            ['t_account' => $acctId, 't_date' => '2024-01-01', 't_type' => 'Deposit', 't_amt' => 100, 't_description' => 'D1'],
            ['t_account' => $acctId, 't_date' => '2024-01-05', 't_type' => 'Withdrawal', 't_amt' => 20, 't_description' => 'W1'],
            ['t_account' => $acctId, 't_date' => '2024-01-15', 't_type' => 'Deposit', 't_amt' => 50, 't_description' => 'D2'],
        ]);

        // Statements: Jan 1, Jan 5, Jan 10 (override=200), Jan 15
        DB::table('fin_statements')->insert([
            ['acct_id' => $acctId, 'balance' => '100', 'statement_closing_date' => '2024-01-01', 'cost_basis' => 0, 'is_cost_basis_override' => 0],
            ['acct_id' => $acctId, 'balance' => '80', 'statement_closing_date' => '2024-01-05', 'cost_basis' => 0, 'is_cost_basis_override' => 0],
            ['acct_id' => $acctId, 'balance' => '200', 'statement_closing_date' => '2024-01-10', 'cost_basis' => 200, 'is_cost_basis_override' => 1],
            ['acct_id' => $acctId, 'balance' => '250', 'statement_closing_date' => '2024-01-15', 'cost_basis' => 0, 'is_cost_basis_override' => 0],
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/balance-timeseries");
        $response->assertOk();

        $data = $response->json();
        $this->assertCount(4, $data);

        $this->assertEquals(100.0, $data[0]['cost_basis']);  // Jan 1: Deposit 100 -> 100
        $this->assertEquals(80.0, $data[1]['cost_basis']);   // Jan 5: Withdrawal 20 -> 80
        $this->assertEquals(200.0, $data[2]['cost_basis']);  // Jan 10: Override -> 200
        $this->assertEquals(250.0, $data[3]['cost_basis']);  // Jan 15: Deposit 50 -> 200+50=250
    }

    public function test_cost_basis_algorithm_example2_multiple_overrides_and_transfers(): void
    {
        $user = $this->createUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Account 2',
            'acct_last_balance' => '0',
        ]);

        // Transactions: Feb 1 Deposit 500, Feb 3 Transfer -100, Feb 7 Transfer 200, Feb 12 Withdrawal 50
        DB::table('fin_account_line_items')->insert([
            ['t_account' => $acctId, 't_date' => '2024-02-01', 't_type' => 'Deposit', 't_amt' => 500, 't_description' => 'D1'],
            ['t_account' => $acctId, 't_date' => '2024-02-03', 't_type' => 'Transfer', 't_amt' => -100, 't_description' => 'T1'],
            ['t_account' => $acctId, 't_date' => '2024-02-07', 't_type' => 'Transfer', 't_amt' => 200, 't_description' => 'T2'],
            ['t_account' => $acctId, 't_date' => '2024-02-12', 't_type' => 'Withdrawal', 't_amt' => 50, 't_description' => 'W1'],
        ]);

        // Statements: Feb 1, Feb 3, Feb 5 (override=1000), Feb 7, Feb 10 (override=300), Feb 12
        DB::table('fin_statements')->insert([
            ['acct_id' => $acctId, 'balance' => '500', 'statement_closing_date' => '2024-02-01', 'cost_basis' => 0, 'is_cost_basis_override' => 0],
            ['acct_id' => $acctId, 'balance' => '400', 'statement_closing_date' => '2024-02-03', 'cost_basis' => 0, 'is_cost_basis_override' => 0],
            ['acct_id' => $acctId, 'balance' => '1000', 'statement_closing_date' => '2024-02-05', 'cost_basis' => 1000, 'is_cost_basis_override' => 1],
            ['acct_id' => $acctId, 'balance' => '1200', 'statement_closing_date' => '2024-02-07', 'cost_basis' => 0, 'is_cost_basis_override' => 0],
            ['acct_id' => $acctId, 'balance' => '300', 'statement_closing_date' => '2024-02-10', 'cost_basis' => 300, 'is_cost_basis_override' => 1],
            ['acct_id' => $acctId, 'balance' => '250', 'statement_closing_date' => '2024-02-12', 'cost_basis' => 0, 'is_cost_basis_override' => 0],
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/balance-timeseries");
        $response->assertOk();

        $data = $response->json();
        $this->assertCount(6, $data);

        $this->assertEquals(500.0, $data[0]['cost_basis']);   // Feb 1: Deposit 500 -> 500
        $this->assertEquals(400.0, $data[1]['cost_basis']);   // Feb 3: Transfer -100 -> 400
        $this->assertEquals(1000.0, $data[2]['cost_basis']);  // Feb 5: Override -> 1000
        $this->assertEquals(1200.0, $data[3]['cost_basis']);  // Feb 7: Transfer 200 -> 1200
        $this->assertEquals(300.0, $data[4]['cost_basis']);   // Feb 10: Override -> 300
        $this->assertEquals(250.0, $data[5]['cost_basis']);   // Feb 12: Withdrawal 50 -> 250
    }

    public function test_balance_timeseries_includes_statement_return_percentages_excluding_cash_flows(): void
    {
        $user = $this->createUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Return Test Account',
            'acct_last_balance' => '0',
        ]);

        DB::table('fin_account_line_items')->insert([
            ['t_account' => $acctId, 't_date' => '2025-01-15', 't_type' => 'Deposit', 't_amt' => 500, 't_description' => 'Contribution'],
            ['t_account' => $acctId, 't_date' => '2025-02-15', 't_type' => 'Fee', 't_amt' => -10, 't_description' => 'Management fee'],
            ['t_account' => $acctId, 't_date' => '2025-03-10', 't_type' => 'Withdrawal', 't_amt' => -100, 't_description' => 'Distribution'],
        ]);

        DB::table('fin_statements')->insert([
            ['acct_id' => $acctId, 'balance' => '1000', 'statement_closing_date' => '2024-12-31', 'cost_basis' => 0, 'is_cost_basis_override' => 0],
            ['acct_id' => $acctId, 'balance' => '1500', 'statement_closing_date' => '2025-01-31', 'cost_basis' => 0, 'is_cost_basis_override' => 0],
            ['acct_id' => $acctId, 'balance' => '1640', 'statement_closing_date' => '2025-02-28', 'cost_basis' => 0, 'is_cost_basis_override' => 0],
            ['acct_id' => $acctId, 'balance' => '1740', 'statement_closing_date' => '2025-03-31', 'cost_basis' => 0, 'is_cost_basis_override' => 0],
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/balance-timeseries");
        $response->assertOk();

        $data = $response->json();
        $this->assertCount(4, $data);
        $this->assertNull($data[0]['return_pct']);
        $this->assertNull($data[0]['ytd_return_pct']);
        $this->assertEqualsWithDelta(0.0, $data[1]['return_pct'], 0.0001);
        $this->assertEqualsWithDelta(0.0, $data[1]['ytd_return_pct'], 0.0001);
        $this->assertEqualsWithDelta(10.0, $data[2]['return_pct'], 0.0001);
        $this->assertEqualsWithDelta(15.0, $data[2]['ytd_return_pct'], 0.0001);
        $this->assertEqualsWithDelta(12.1951, $data[3]['return_pct'], 0.0001);
        $this->assertEqualsWithDelta(35.0, $data[3]['ytd_return_pct'], 0.0001);
    }

    public function test_update_statement_persists_cost_basis_override(): void
    {
        $user = $this->createUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Account',
            'acct_last_balance' => '0',
        ]);

        $stmtId = DB::table('fin_statements')->insertGetId([
            'acct_id' => $acctId,
            'balance' => '1000',
            'statement_closing_date' => '2024-01-31',
            'cost_basis' => 0,
            'is_cost_basis_override' => 0,
        ]);

        $response = $this->actingAs($user)->putJson("/api/finance/balance-timeseries/{$stmtId}", [
            'balance' => '1000',
            'is_cost_basis_override' => true,
            'cost_basis' => 900,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('fin_statements', [
            'statement_id' => $stmtId,
            'cost_basis' => 900,
            'is_cost_basis_override' => 1,
        ]);
    }

    public function test_update_statement_clears_cost_basis_when_override_disabled(): void
    {
        $user = $this->createUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Account',
            'acct_last_balance' => '0',
        ]);

        $stmtId = DB::table('fin_statements')->insertGetId([
            'acct_id' => $acctId,
            'balance' => '1000',
            'statement_closing_date' => '2024-01-31',
            'cost_basis' => 900,
            'is_cost_basis_override' => 1,
        ]);

        $response = $this->actingAs($user)->putJson("/api/finance/balance-timeseries/{$stmtId}", [
            'balance' => '1000',
            'is_cost_basis_override' => false,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('fin_statements', [
            'statement_id' => $stmtId,
            'cost_basis' => 0,
            'is_cost_basis_override' => 0,
        ]);
    }

    public function test_document_statement_import_truncates_dates(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'X',
            'acct_last_balance' => '0',
        ]);

        $payload = [
            'document_kind' => 'statement',
            'accounts' => [
                [
                    'acct_id' => $acctId,
                    'statementInfo' => [
                        'periodStart' => '2025-01-01T12:34:56Z',
                        'periodEnd' => '2025-01-31T23:59:59-05:00',
                        'closingBalance' => 1234.56,
                    ],
                    'statementDetails' => [],
                    'transactions' => [],
                    'lots' => [],
                ],
            ],
        ];

        $response = $this->actingAs($user)->postJson('/api/finance/documents', $payload);
        $response->assertCreated();

        $this->assertDatabaseHas('fin_statements', [
            'acct_id' => $acctId,
            'statement_closing_date' => '2025-01-31',
        ]);
    }

    public function test_document_statement_import_creates_statements_for_each_account(): void
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
            'document_kind' => 'statement',
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

        $response = $this->actingAs($user)->postJson('/api/finance/documents', $payload);
        $response->assertCreated();

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

    public function test_document_statement_import_requires_authentication(): void
    {
        $response = $this->postJson('/api/finance/documents', [
            'document_kind' => 'statement',
            'accounts' => [],
        ]);
        $response->assertUnauthorized();
    }

    public function test_document_statement_import_rejects_other_users_accounts(): void
    {
        $user1 = $this->createAdminUser();
        $user2 = $this->createUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user2->id,
            'acct_name' => 'Other account',
            'acct_last_balance' => '0',
        ]);

        $payload = [
            'document_kind' => 'statement',
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

        $response = $this->actingAs($user1)->postJson('/api/finance/documents', $payload);
        $response->assertUnprocessable();
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

    public function test_balance_timeseries_marks_has_pdf_when_linked_fin_document_has_s3_path(): void
    {
        $user = $this->createUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Savings',
            'acct_last_balance' => '0',
        ]);

        $document = FinDocument::create([
            'user_id' => $user->id,
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'statement.pdf',
            'stored_filename' => 'statement.pdf',
            's3_path' => "fin_documents/{$user->id}/statement/statement.pdf",
            'mime_type' => 'application/pdf',
        ]);

        $statementId = DB::table('fin_statements')->insertGetId([
            'document_id' => $document->id,
            'acct_id' => $acctId,
            'balance' => '5000',
            'statement_closing_date' => '2025-01-31',
            'cost_basis' => 0,
            'is_cost_basis_override' => 0,
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/balance-timeseries");

        $response->assertOk()
            ->assertJsonPath('0.statement_id', $statementId)
            ->assertJsonPath('0.hasPdf', true);
    }

    public function test_view_statement_pdf_resolves_linked_fin_document_for_user_account(): void
    {
        $user = $this->createUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Savings',
            'acct_last_balance' => '0',
        ]);

        $document = FinDocument::create([
            'user_id' => $user->id,
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'statement.pdf',
            'stored_filename' => 'statement.pdf',
            's3_path' => "fin_documents/{$user->id}/statement/statement.pdf",
            'mime_type' => 'application/pdf',
        ]);

        $statementId = DB::table('fin_statements')->insertGetId([
            'document_id' => $document->id,
            'acct_id' => $acctId,
            'balance' => '5000',
            'statement_closing_date' => '2025-01-31',
            'cost_basis' => 0,
            'is_cost_basis_override' => 0,
        ]);

        $this->mock(FileStorageService::class, function ($mock) use ($document): void {
            $mock->shouldReceive('getSignedViewUrl')
                ->once()
                ->with($document->s3_path, 'application/pdf')
                ->andReturn('https://signed.example/view');
            $mock->shouldReceive('getSignedDownloadUrl')
                ->once()
                ->with($document->s3_path, 'statement.pdf')
                ->andReturn('https://signed.example/download');
        });

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/statements/{$statementId}/pdf");

        $response->assertOk()
            ->assertJson([
                'view_url' => 'https://signed.example/view',
                'download_url' => 'https://signed.example/download',
                'filename' => 'statement.pdf',
            ]);
    }

    public function test_view_statement_pdf_does_not_sign_linked_fin_document_with_invalid_statement_path(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Savings',
            'acct_last_balance' => '0',
        ]);

        $document = FinDocument::create([
            'user_id' => $user->id,
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'statement.pdf',
            'stored_filename' => 'statement.pdf',
            's3_path' => "fin_documents/{$otherUser->id}/statement/statement.pdf",
            'mime_type' => 'application/pdf',
        ]);

        $statementId = DB::table('fin_statements')->insertGetId([
            'document_id' => $document->id,
            'acct_id' => $acctId,
            'balance' => '5000',
            'statement_closing_date' => '2025-01-31',
            'cost_basis' => 0,
            'is_cost_basis_override' => 0,
        ]);

        $this->mock(FileStorageService::class, function ($mock): void {
            $mock->shouldNotReceive('getSignedViewUrl');
            $mock->shouldNotReceive('getSignedDownloadUrl');
        });

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/statements/{$statementId}/pdf");

        $response->assertNotFound();
    }

    public function test_view_statement_pdf_signs_linked_csv_import_fin_document_with_valid_path(): void
    {
        // FIX 2 regression guard: import-pipeline documents (csv_import, json_import, toon_import)
        // must be viewable via this endpoint when their s3_path is under the owner's
        // expected prefix for their own kind — they must NOT be 404'd just because
        // their document_kind is not KIND_STATEMENT.
        $user = $this->createUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Savings',
            'acct_last_balance' => '0',
        ]);

        $document = FinDocument::create([
            'user_id' => $user->id,
            'document_kind' => FinDocument::KIND_CSV_IMPORT,
            'original_filename' => 'history.csv',
            'stored_filename' => 'history.csv',
            's3_path' => "fin_documents/{$user->id}/csv_import/history.csv",
            'mime_type' => 'text/csv',
        ]);

        $statementId = DB::table('fin_statements')->insertGetId([
            'document_id' => $document->id,
            'acct_id' => $acctId,
            'balance' => '5000',
            'statement_closing_date' => '2025-01-31',
            'cost_basis' => 0,
            'is_cost_basis_override' => 0,
        ]);

        $this->mock(FileStorageService::class, function ($mock) use ($document): void {
            $mock->shouldReceive('getSignedViewUrl')
                ->once()
                ->with($document->s3_path, 'text/csv')
                ->andReturn('https://signed.example/view-csv');
            $mock->shouldReceive('getSignedDownloadUrl')
                ->once()
                ->with($document->s3_path, 'history.csv')
                ->andReturn('https://signed.example/download-csv');
        });

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/statements/{$statementId}/pdf");

        $response->assertOk()
            ->assertJson([
                'view_url' => 'https://signed.example/view-csv',
                'download_url' => 'https://signed.example/download-csv',
                'filename' => 'history.csv',
            ]);
    }

    public function test_view_statement_pdf_does_not_sign_csv_import_document_with_cross_user_path(): void
    {
        // Even after FIX 2, a csv_import document whose s3_path points to another user's
        // prefix must still be rejected (path validation is per-kind, not kind-blind).
        $user = $this->createUser();
        $otherUser = $this->createUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Savings',
            'acct_last_balance' => '0',
        ]);

        $poisonedDocument = FinDocument::create([
            'user_id' => $user->id,
            'document_kind' => FinDocument::KIND_CSV_IMPORT,
            'original_filename' => 'history.csv',
            'stored_filename' => 'history.csv',
            's3_path' => "fin_documents/{$otherUser->id}/csv_import/history.csv",
            'mime_type' => 'text/csv',
        ]);

        $statementId = DB::table('fin_statements')->insertGetId([
            'document_id' => $poisonedDocument->id,
            'acct_id' => $acctId,
            'balance' => '5000',
            'statement_closing_date' => '2025-01-31',
            'cost_basis' => 0,
            'is_cost_basis_override' => 0,
        ]);

        $this->mock(FileStorageService::class, function ($mock): void {
            $mock->shouldNotReceive('getSignedViewUrl');
            $mock->shouldNotReceive('getSignedDownloadUrl');
        });

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/statements/{$statementId}/pdf");

        $response->assertNotFound();
    }

    public function test_view_statement_pdf_does_not_resolve_linked_fin_document_for_another_user(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Savings',
            'acct_last_balance' => '0',
        ]);

        $document = FinDocument::create([
            'user_id' => $otherUser->id,
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'statement.pdf',
            'stored_filename' => 'statement.pdf',
            's3_path' => "fin_documents/{$otherUser->id}/statement/statement.pdf",
            'mime_type' => 'application/pdf',
        ]);

        $statementId = DB::table('fin_statements')->insertGetId([
            'document_id' => $document->id,
            'acct_id' => $acctId,
            'balance' => '5000',
            'statement_closing_date' => '2025-01-31',
            'cost_basis' => 0,
            'is_cost_basis_override' => 0,
        ]);

        $this->mock(FileStorageService::class, function ($mock): void {
            $mock->shouldNotReceive('getSignedViewUrl');
            $mock->shouldNotReceive('getSignedDownloadUrl');
        });

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/statements/{$statementId}/pdf");

        $response->assertNotFound();
    }

    public function test_attach_file_to_statement_then_view_pdf(): void
    {
        $user = $this->createUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Savings',
            'acct_last_balance' => '0',
        ]);

        $statementId = DB::table('fin_statements')->insertGetId([
            'acct_id' => $acctId,
            'balance' => '5000',
            'statement_closing_date' => '2025-01-31',
            'cost_basis' => 0,
            'is_cost_basis_override' => 0,
        ]);

        $this->mock(FileStorageService::class, function ($mock) use ($user): void {
            $mock->shouldReceive('createFileRecord')
                ->once()
                ->andReturnUsing(function (Model $fileModel, UploadedFile $file): Model {
                    $fileModel->save();

                    return $fileModel;
                });
            $mock->shouldReceive('getSignedViewUrl')
                ->once()
                ->with(Mockery::on(fn (string $path): bool => str_starts_with($path, "fin_acct/{$user->id}/")), 'application/pdf')
                ->andReturn('https://signed.example/view');
            $mock->shouldReceive('getSignedDownloadUrl')
                ->once()
                ->with(Mockery::type('string'), 'statement.pdf')
                ->andReturn('https://signed.example/download');
        });

        $uploadResponse = $this->actingAs($user)->post("/api/finance/{$acctId}/files", [
            'statement_id' => $statementId,
            'file' => UploadedFile::fake()->create('statement.pdf', 12, 'application/pdf'),
        ]);

        $uploadResponse->assertCreated();
        $this->assertDatabaseHas('files_for_fin_accounts', [
            'acct_id' => $acctId,
            'statement_id' => $statementId,
            'original_filename' => 'statement.pdf',
        ]);

        $viewResponse = $this->actingAs($user)->getJson("/api/finance/{$acctId}/statements/{$statementId}/pdf");

        $viewResponse->assertOk()
            ->assertJson([
                'view_url' => 'https://signed.example/view',
                'download_url' => 'https://signed.example/download',
                'filename' => 'statement.pdf',
            ]);
    }

    public function test_fin_account_files_can_be_filtered_to_unlinked_statement_files(): void
    {
        $user = $this->createUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Savings',
            'acct_last_balance' => '0',
        ]);

        $statementId = DB::table('fin_statements')->insertGetId([
            'acct_id' => $acctId,
            'balance' => '5000',
            'statement_closing_date' => '2025-01-31',
            'cost_basis' => 0,
            'is_cost_basis_override' => 0,
        ]);

        DB::table('files_for_fin_accounts')->insert([
            [
                'acct_id' => $acctId,
                'statement_id' => null,
                'file_hash' => 'orphan-hash',
                'original_filename' => 'orphan.pdf',
                'stored_filename' => '2025.01.01 orphan.pdf',
                's3_path' => "fin_acct/{$user->id}/2025.01.01 orphan.pdf",
                'mime_type' => 'application/pdf',
                'file_size_bytes' => 1024,
                'uploaded_by_user_id' => $user->id,
                'created_at' => now()->subMinute(),
                'updated_at' => now()->subMinute(),
            ],
            [
                'acct_id' => $acctId,
                'statement_id' => $statementId,
                'file_hash' => 'linked-hash',
                'original_filename' => 'linked.pdf',
                'stored_filename' => '2025.01.01 linked.pdf',
                's3_path' => "fin_acct/{$user->id}/2025.01.01 linked.pdf",
                'mime_type' => 'application/pdf',
                'file_size_bytes' => 2048,
                'uploaded_by_user_id' => $user->id,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/files?unlinked=1");

        $response->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.original_filename', 'orphan.pdf')
            ->assertJsonPath('0.statement_id', null);
    }

    public function test_document_statement_import_updates_file_record_statement_id_when_file_exists(): void
    {
        $user = $this->createAdminUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Savings',
            'acct_last_balance' => '0',
        ]);

        $fileHash = 'abc123def456';

        // Create a pre-existing file record for this account (statement_id not yet set)
        $fileId = DB::table('files_for_fin_accounts')->insertGetId([
            'acct_id' => $acctId,
            'file_hash' => $fileHash,
            'original_filename' => 'statement.pdf',
            'stored_filename' => '2025.01.01 abcde statement.pdf',
            's3_path' => "fin_acct/{$user->id}/2025.01.01 abcde statement.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'uploaded_by_user_id' => $user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $payload = [
            'document_kind' => 'statement',
            'file_hash' => $fileHash,
            'accounts' => [
                [
                    'acct_id' => $acctId,
                    'statementInfo' => ['periodStart' => '2025-01-01', 'periodEnd' => '2025-01-31', 'closingBalance' => 5000],
                    'statementDetails' => [],
                    'transactions' => [],
                    'lots' => [],
                ],
            ],
        ];

        $response = $this->actingAs($user)->postJson('/api/finance/documents', $payload);
        $response->assertCreated();

        $json = $response->json();
        $statementId = $json['accounts'][0]['statement_id'];

        // The file record for this account should now have statement_id set
        $this->assertDatabaseHas('files_for_fin_accounts', [
            'id' => $fileId,
            'acct_id' => $acctId,
            'file_hash' => $fileHash,
            'statement_id' => $statementId,
        ]);
    }

    public function test_document_statement_import_clones_file_record_for_additional_accounts(): void
    {
        $user = $this->createAdminUser();

        $acctId1 = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Savings',
            'acct_last_balance' => '0',
        ]);
        $acctId2 = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Checking',
            'acct_last_balance' => '0',
        ]);

        $fileHash = 'sha256deadbeef';

        // File exists only for acctId1 (the primary account)
        DB::table('files_for_fin_accounts')->insert([
            'acct_id' => $acctId1,
            'file_hash' => $fileHash,
            'original_filename' => 'multi.pdf',
            'stored_filename' => '2025.01.01 xyzab multi.pdf',
            's3_path' => "fin_acct/{$user->id}/2025.01.01 xyzab multi.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 2048,
            'uploaded_by_user_id' => $user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $payload = [
            'document_kind' => 'statement',
            'file_hash' => $fileHash,
            'accounts' => [
                [
                    'acct_id' => $acctId1,
                    'statementInfo' => ['periodEnd' => '2025-01-31', 'closingBalance' => 1000],
                    'statementDetails' => [],
                    'transactions' => [],
                    'lots' => [],
                ],
                [
                    'acct_id' => $acctId2,
                    'statementInfo' => ['periodEnd' => '2025-01-31', 'closingBalance' => 2000],
                    'statementDetails' => [],
                    'transactions' => [],
                    'lots' => [],
                ],
            ],
        ];

        $response = $this->actingAs($user)->postJson('/api/finance/documents', $payload);
        $response->assertCreated();

        $json = $response->json();
        $statementId2 = $json['accounts'][1]['statement_id'];

        // A cloned file record should now exist for acctId2 with the correct statement_id
        $this->assertDatabaseHas('files_for_fin_accounts', [
            'acct_id' => $acctId2,
            'file_hash' => $fileHash,
            'statement_id' => $statementId2,
        ]);

        // Total: 2 file records for this file_hash (one per account)
        $count = DB::table('files_for_fin_accounts')
            ->where('file_hash', $fileHash)
            ->count();
        $this->assertEquals(2, $count);
    }

    public function test_document_statement_import_no_file_hash_does_not_create_file_records(): void
    {
        $user = $this->createAdminUser();

        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Savings',
            'acct_last_balance' => '0',
        ]);

        $payload = [
            'document_kind' => 'statement',
            'accounts' => [
                [
                    'acct_id' => $acctId,
                    'statementInfo' => ['periodEnd' => '2025-01-31', 'closingBalance' => 1000],
                    'statementDetails' => [],
                    'transactions' => [],
                    'lots' => [],
                ],
            ],
        ];

        $response = $this->actingAs($user)->postJson('/api/finance/documents', $payload);
        $response->assertCreated();

        $this->assertDatabaseCount('files_for_fin_accounts', 0);
    }
}
