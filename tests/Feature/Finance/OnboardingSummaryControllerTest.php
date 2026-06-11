<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OnboardingSummaryControllerTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<string> */
    private array $allFinancePermissions = [
        'finance.access',
        'finance.accounts.manage',
        'finance.transactions.manage',
        'finance.transactions.import',
        'finance.lots.manage',
        'finance.tax-preview.manage',
        'finance.tax-documents.manage',
        'finance.rsu.manage',
        'finance.payslips.manage',
        'finance.rules.manage',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        // Consume user ID 1 (always admin) so subsequent users are non-admin
        // and must pass the feature-permission gate.
        User::factory()->create(['user_role' => 'admin']);
    }

    public function test_requires_authentication(): void
    {
        $response = $this->getJson('/api/finance/onboarding-summary');
        $response->assertStatus(401);
    }

    public function test_requires_finance_access(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $response = $this->getJson('/api/finance/onboarding-summary');
        $response->assertStatus(403);
    }

    public function test_blank_user_receives_actionable_not_started_sections(): void
    {
        $user = $this->userWithFinanceAccess($this->allFinancePermissions);
        $this->actingAs($user);

        $response = $this->getJson('/api/finance/onboarding-summary?year=2024');

        $response->assertOk();
        $accounts = $this->section($response->json('sections'), 'accounts');
        $this->assertSame('not_started', $accounts['status']);
        $this->assertNotEmpty($accounts['actions']);

        $transactions = $this->section($response->json('sections'), 'transactions');
        $this->assertSame('not_started', $transactions['status']);

        $this->assertNotEmpty($response->json('primaryActions'));
    }

    public function test_accounts_ready_without_transactions(): void
    {
        $user = $this->userWithFinanceAccess($this->allFinancePermissions);
        $this->actingAs($user);
        $this->makeFinAccount($user);

        $response = $this->getJson('/api/finance/onboarding-summary?year=2024');

        $response->assertOk();
        $this->assertSame('ready', $this->section($response->json('sections'), 'accounts')['status']);
        $this->assertSame('not_started', $this->section($response->json('sections'), 'transactions')['status']);
    }

    public function test_transactions_ready_when_present(): void
    {
        $user = $this->userWithFinanceAccess($this->allFinancePermissions);
        $this->actingAs($user);
        $account = $this->makeFinAccount($user);
        FinAccountLineItems::query()->create([
            't_account' => $account->acct_id,
            't_date' => '2024-03-15',
            't_type' => 'buy',
            't_amt' => '100',
        ]);

        $response = $this->getJson('/api/finance/onboarding-summary?year=2024');

        $response->assertOk();
        $transactions = $this->section($response->json('sections'), 'transactions');
        $this->assertSame('ready', $transactions['status']);
        $this->assertSame(1, $transactions['counts']['transactions']);
    }

    public function test_pending_parsed_documents_yield_needs_attention(): void
    {
        $user = $this->userWithFinanceAccess($this->allFinancePermissions);
        $this->actingAs($user);
        $this->createTaxDocument($user, [
            'form_type' => '1099_div',
            'genai_status' => 'parsed',
            'is_reviewed' => false,
        ]);

        $response = $this->getJson('/api/finance/onboarding-summary?year=2024');

        $response->assertOk();
        $documents = $this->section($response->json('sections'), 'documents');
        $this->assertSame('needs_attention', $documents['status']);
        $this->assertSame(1, $documents['counts']['pending_review']);

        $warningIds = array_column($response->json('warnings'), 'id');
        $this->assertContains('warning.documents', $warningIds);
    }

    public function test_section_without_view_permission_returns_no_access_with_no_counts_or_summary(): void
    {
        // Grants finance.access only — every dependent section must be no_access.
        $user = $this->userWithFinanceAccess(['finance.access']);
        $this->actingAs($user);

        // Create payslip data as a different user so it can never leak.
        $other = $this->userWithFinanceAccess($this->allFinancePermissions);

        $response = $this->getJson('/api/finance/onboarding-summary?year=2024');

        $response->assertOk();
        foreach (['accounts', 'transactions', 'documents', 'payslips', 'lots', 'tax_preview', 'employment', 'carryovers', 'categorization', 'k1_basis'] as $sectionId) {
            $section = $this->section($response->json('sections'), $sectionId);
            $this->assertSame('no_access', $section['status'], "Section {$sectionId} should be no_access");
            $this->assertArrayNotHasKey('counts', $section, "Section {$sectionId} must not expose counts");
            $this->assertSame('', $section['summary'], "Section {$sectionId} must not expose summary text");
            $this->assertSame([], $section['actions']);
        }
    }

    public function test_actions_are_permission_filtered(): void
    {
        // View-only on accounts: the manage action must be filtered out.
        $user = $this->userWithFinanceAccess(['finance.access', 'finance.accounts.detail']);
        $this->actingAs($user);
        $this->makeFinAccount($user);

        $response = $this->getJson('/api/finance/onboarding-summary?year=2024');

        $response->assertOk();
        $accounts = $this->section($response->json('sections'), 'accounts');
        $actionIds = array_column($accounts['actions'], 'id');
        $this->assertNotContains('accounts.add', $actionIds);
        $this->assertContains('accounts.view', $actionIds);
    }

    public function test_rejects_out_of_range_year(): void
    {
        $user = $this->userWithFinanceAccess(['finance.access']);
        $this->actingAs($user);

        $this->getJson('/api/finance/onboarding-summary?year=1800')->assertStatus(422);
        $this->getJson('/api/finance/onboarding-summary?year=2200')->assertStatus(422);
    }

    /**
     * @param  list<string>  $permissions
     */
    private function userWithFinanceAccess(array $permissions): User
    {
        return $this->grantFeatures(User::factory()->create(), $permissions);
    }

    /**
     * @param  list<array<string, mixed>>  $sections
     * @return array<string, mixed>
     */
    private function section(array $sections, string $id): array
    {
        foreach ($sections as $section) {
            if ($section['id'] === $id) {
                return $section;
            }
        }

        $this->fail("Section {$id} not found");
    }

    private function makeFinAccount(User $user): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($user): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $user->id,
                'acct_name' => 'Test Brokerage',
                'acct_number' => '9999',
                'acct_last_balance' => '0',
            ]);
        });
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createTaxDocument(User $user, array $overrides = []): FileForTaxDocument
    {
        return app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $user->id,
            'tax_year' => 2024,
            'form_type' => 'w2',
            'original_filename' => 'test.pdf',
            'file_path' => '/tmp/test.pdf',
            'file_size_bytes' => 1000,
            'file_hash' => md5('test-'.uniqid()),
            'genai_status' => 'parsed',
            'is_reviewed' => false,
            ...$overrides,
        ]);
    }
}
