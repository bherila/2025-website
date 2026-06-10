<?php

namespace Tests\Feature\Agent\Finance;

use App\Models\AgentApiToken;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPayslips;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;
use App\Support\Agent\AgentTokenService;
use Tests\TestCase;

class FinanceAgentReadTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // User ID 1 is always treated as admin; occupy it so the users under
        // test are genuinely non-admin.
        $this->createAdminUser();
    }

    /** @return array{user: User, token: string} */
    private function createUserWithToken(array $permissions): array
    {
        $user = $this->grantFeatures($this->createUser(), $permissions);
        $result = app(AgentTokenService::class)->createQuickSetupToken($user, 'finance', null);

        return ['user' => $user, 'token' => $result['token']];
    }

    /** @return array<string, string> */
    private function bearer(string $token): array
    {
        return ['Authorization' => 'Bearer '.$token];
    }

    public function test_finance_endpoints_require_token(): void
    {
        foreach (['accounts', 'transactions', 'tax-preview/2024', 'tax-documents', 'tax-documents/1', 'lots', 'payslips'] as $path) {
            $this->getJson("/api/agent/v1/finance/{$path}")->assertStatus(401);
        }
    }

    public function test_endpoint_returns_403_without_feature_permission(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.access']);

        $this->getJson('/api/agent/v1/finance/accounts', $this->bearer($token))
            ->assertStatus(403);
        $this->getJson('/api/agent/v1/finance/payslips', $this->bearer($token))
            ->assertStatus(403);
    }

    public function test_accounts_returns_basic_fields_without_detail_permission(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.accounts.basic']);

        $this->actingAs($user);
        FinAccounts::create(['acct_name' => 'Agent Checking', 'acct_number' => '1234567890']);
        FinAccounts::create(['acct_name' => 'Agent Card', 'acct_is_debt' => true]);

        $response = $this->getJson('/api/agent/v1/finance/accounts', $this->bearer($token));

        $response->assertStatus(200)->assertJson(['include_detail' => false]);

        $accounts = collect($response->json('accounts'));
        $this->assertCount(2, $accounts);
        $this->assertEqualsCanonicalizing(['Agent Checking', 'Agent Card'], $accounts->pluck('acct_name')->all());

        $first = $accounts->first();
        $this->assertArrayNotHasKey('acct_last_balance', $first);
        $this->assertArrayNotHasKey('acct_number', $first);
    }

    public function test_accounts_includes_detail_fields_with_detail_permission(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.accounts.detail']);

        $this->actingAs($user);
        FinAccounts::create(['acct_name' => 'Brokerage', 'acct_last_balance' => '123.45']);

        $response = $this->getJson('/api/agent/v1/finance/accounts', $this->bearer($token));

        $response->assertStatus(200)->assertJson(['include_detail' => true]);

        $first = $response->json('accounts.0');
        $this->assertArrayHasKey('acct_last_balance', $first);
        $this->assertArrayNotHasKey('acct_number', $first);
    }

    public function test_accounts_are_owner_scoped(): void
    {
        ['user' => $userA, 'token' => $tokenA] = $this->createUserWithToken(['finance.accounts.basic']);
        $userB = $this->grantFeatures($this->createUser(), ['finance.accounts.basic']);

        $this->actingAs($userA);
        FinAccounts::create(['acct_name' => 'Mine']);
        $this->actingAs($userB);
        FinAccounts::create(['acct_name' => 'Theirs']);

        $response = $this->getJson('/api/agent/v1/finance/accounts', $this->bearer($tokenA));

        $names = collect($response->json('accounts'))->pluck('acct_name');
        $this->assertContains('Mine', $names);
        $this->assertNotContains('Theirs', $names);
    }

    public function test_token_scope_restricts_access_even_when_user_has_permission(): void
    {
        $user = $this->grantFeatures($this->createUser(), [
            'finance.accounts.detail',
            'finance.transactions.view',
        ]);

        $rawToken = 'bha_'.bin2hex(random_bytes(32));
        AgentApiToken::factory()->create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $rawToken),
            'allowed_permissions' => ['finance.access', 'finance.accounts.basic'],
        ]);

        // Scope excludes transactions.view entirely → 403 despite user grant.
        $this->getJson('/api/agent/v1/finance/transactions', $this->bearer($rawToken))
            ->assertStatus(403);

        // Scope excludes accounts.detail → detail fields are suppressed.
        $this->getJson('/api/agent/v1/finance/accounts', $this->bearer($rawToken))
            ->assertStatus(200)
            ->assertJson(['include_detail' => false]);
    }

    public function test_transactions_are_owner_scoped_with_cursor_pagination(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.transactions.view']);
        $other = $this->createUser();

        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Checking']);
        foreach (['2024-03-01', '2024-02-01', '2023-05-01'] as $i => $date) {
            FinAccountLineItems::create([
                't_account' => $account->acct_id,
                't_date' => $date,
                't_amt' => 100 + $i,
                't_description' => "Txn {$i}",
            ]);
        }

        $this->actingAs($other);
        $otherAccount = FinAccounts::create(['acct_name' => 'Other Checking']);
        FinAccountLineItems::create([
            't_account' => $otherAccount->acct_id,
            't_date' => '2024-03-01',
            't_amt' => 999,
            't_description' => 'Not yours',
        ]);

        $response = $this->getJson('/api/agent/v1/finance/transactions', $this->bearer($token));
        $response->assertStatus(200);
        $this->assertCount(3, $response->json('transactions'));
        $this->assertNull($response->json('next_cursor'));
        $this->assertNotContains('Not yours', collect($response->json('transactions'))->pluck('t_description'));

        // Year filter
        $byYear = $this->getJson('/api/agent/v1/finance/transactions?year=2023', $this->bearer($token));
        $this->assertCount(1, $byYear->json('transactions'));

        // Cursor pagination: page size 2, then the remaining 1.
        $page1 = $this->getJson('/api/agent/v1/finance/transactions?limit=2', $this->bearer($token));
        $this->assertCount(2, $page1->json('transactions'));
        $this->assertSame(2, $page1->json('next_cursor'));

        $page2 = $this->getJson('/api/agent/v1/finance/transactions?limit=2&cursor=2', $this->bearer($token));
        $this->assertCount(1, $page2->json('transactions'));
        $this->assertNull($page2->json('next_cursor'));

        $ids = array_merge(
            collect($page1->json('transactions'))->pluck('t_id')->all(),
            collect($page2->json('transactions'))->pluck('t_id')->all(),
        );
        $this->assertCount(3, array_unique($ids));
    }

    public function test_transactions_with_non_owned_account_returns_404(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.transactions.view']);
        $other = $this->createUser();

        $this->actingAs($other);
        $otherAccount = FinAccounts::create(['acct_name' => 'Other Checking']);

        $this->getJson("/api/agent/v1/finance/transactions?acct_id={$otherAccount->acct_id}", $this->bearer($token))
            ->assertStatus(404);
    }

    public function test_tax_preview_returns_dataset_for_year(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.tax-preview.view']);

        $response = $this->getJson('/api/agent/v1/finance/tax-preview/2024', $this->bearer($token));

        $response->assertStatus(200)->assertJsonStructure(['year', 'availableYears']);
        $this->assertSame(2024, $response->json('year'));

        $withFacts = $this->getJson('/api/agent/v1/finance/tax-preview/2024?include_tax_facts=1', $this->bearer($token));
        $this->assertArrayHasKey('taxFacts', $withFacts->json());
    }

    public function test_tax_documents_list_excludes_parsed_data(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.tax-documents.view']);

        $this->createTaxDocumentFor($user, ['parsed_data' => ['wages' => 123456]]);

        $response = $this->getJson('/api/agent/v1/finance/tax-documents', $this->bearer($token));

        $response->assertStatus(200);
        $docs = $response->json('tax_documents');
        $this->assertCount(1, $docs);
        $this->assertArrayNotHasKey('parsed_data', $docs[0]);
        $this->assertArrayNotHasKey('s3_path', $docs[0]);
        $this->assertSame('w2', $docs[0]['form_type']);
    }

    public function test_tax_document_detail_includes_parsed_data(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.tax-documents.view']);

        $doc = $this->createTaxDocumentFor($user, ['parsed_data' => ['wages' => 123456]]);

        $response = $this->getJson("/api/agent/v1/finance/tax-documents/{$doc->id}", $this->bearer($token));

        $response->assertStatus(200);
        $this->assertSame(['wages' => 123456], $response->json('parsed_data'));
    }

    public function test_tax_document_detail_for_non_owned_document_returns_404(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.tax-documents.view']);
        $other = $this->createUser();

        $doc = $this->createTaxDocumentFor($other);

        $this->getJson("/api/agent/v1/finance/tax-documents/{$doc->id}", $this->bearer($token))
            ->assertStatus(404);
    }

    public function test_lots_list_supports_year_as_of_filter(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.lots.view']);

        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Brokerage']);
        FinAccountLot::create([
            'acct_id' => $account->acct_id,
            'symbol' => 'OPEN',
            'quantity' => 10,
            'purchase_date' => '2023-01-15',
            'cost_basis' => 1000,
        ]);
        FinAccountLot::create([
            'acct_id' => $account->acct_id,
            'symbol' => 'SOLD',
            'quantity' => 5,
            'purchase_date' => '2023-02-01',
            'sale_date' => '2024-06-01',
            'cost_basis' => 500,
        ]);

        $open = $this->getJson('/api/agent/v1/finance/lots', $this->bearer($token));
        $open->assertStatus(200);
        $this->assertEqualsCanonicalizing(['OPEN'], collect($open->json('lots'))->pluck('symbol')->all());

        $atYearEnd2023 = $this->getJson('/api/agent/v1/finance/lots?year=2023', $this->bearer($token));
        $this->assertEqualsCanonicalizing(['OPEN', 'SOLD'], collect($atYearEnd2023->json('lots'))->pluck('symbol')->all());
    }

    public function test_lots_are_owner_scoped(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.lots.view']);
        $other = $this->createUser();

        $this->actingAs($other);
        $otherAccount = FinAccounts::create(['acct_name' => 'Other Brokerage']);
        FinAccountLot::create([
            'acct_id' => $otherAccount->acct_id,
            'symbol' => 'NOTYOURS',
            'quantity' => 1,
            'purchase_date' => '2023-01-15',
            'cost_basis' => 100,
        ]);

        $response = $this->getJson('/api/agent/v1/finance/lots', $this->bearer($token));
        $response->assertStatus(200);
        $this->assertSame([], $response->json('lots'));

        // Explicitly requesting the other user's account also yields nothing.
        $scoped = $this->getJson("/api/agent/v1/finance/lots?acct_id={$otherAccount->acct_id}", $this->bearer($token));
        $this->assertSame([], $scoped->json('lots'));
    }

    public function test_payslips_list_with_year_filter(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken(['finance.payslips.view']);

        $this->actingAs($user);
        FinPayslips::create(['pay_date' => '2024-01-15', 'earnings_gross' => 5000]);
        FinPayslips::create(['pay_date' => '2023-01-15', 'earnings_gross' => 4000]);

        $response = $this->getJson('/api/agent/v1/finance/payslips', $this->bearer($token));
        $response->assertStatus(200);
        $this->assertCount(2, $response->json('payslips'));
        $this->assertArrayHasKey('state_data', $response->json('payslips.0'));
        $this->assertArrayHasKey('deposits', $response->json('payslips.0'));

        $filtered = $this->getJson('/api/agent/v1/finance/payslips?year=2024', $this->bearer($token));
        $this->assertCount(1, $filtered->json('payslips'));
        $this->assertSame('2024-01-15', substr((string) $filtered->json('payslips.0.pay_date'), 0, 10));
    }

    public function test_payslips_are_owner_scoped(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.payslips.view']);
        $other = $this->createUser();

        $this->actingAs($other);
        FinPayslips::create(['pay_date' => '2024-01-15', 'earnings_gross' => 5000]);

        $response = $this->getJson('/api/agent/v1/finance/payslips', $this->bearer($token));
        $response->assertStatus(200);
        $this->assertSame([], $response->json('payslips'));
    }

    private function createTaxDocumentFor(User $user, array $overrides = [])
    {
        static $sequence = 0;
        $sequence++;

        return app(DocumentIngestionService::class)->createTaxFormDetail(array_merge([
            'user_id' => $user->id,
            'tax_year' => 2024,
            'form_type' => 'w2',
            'original_filename' => "w2_{$sequence}.pdf",
            'stored_filename' => "w2_{$sequence}_stored.pdf",
            's3_path' => "tax_docs/{$user->id}/w2_{$sequence}_stored.pdf",
            'file_size_bytes' => 1024,
            'file_hash' => "agent-read-hash-{$sequence}",
            'uploaded_by_user_id' => $user->id,
            'genai_status' => 'pending',
        ], $overrides));
    }
}
