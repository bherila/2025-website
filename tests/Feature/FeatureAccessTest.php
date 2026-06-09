<?php

namespace Tests\Feature;

use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use App\Models\UserFeaturePermission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FeatureAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
        User::factory()->create(['user_role' => 'admin']);
    }

    public function test_user_role_without_feature_grants_can_log_in_but_cannot_access_private_finance_features(): void
    {
        $user = User::factory()->create(['user_role' => 'user']);

        $this->assertTrue($user->canLogin());

        $this->actingAs($user)->get('/finance/tax-preview')->assertForbidden();
        $this->actingAs($user)->getJson('/api/finance/tax-preview-data')->assertForbidden();
    }

    public function test_user_without_user_or_admin_role_cannot_log_in(): void
    {
        $user = User::factory()->create(['user_role' => '']);

        $this->assertFalse($user->canLogin());
    }

    public function test_admin_can_access_private_features_without_explicit_grants(): void
    {
        $admin = User::factory()->create(['user_role' => 'admin']);

        $this->actingAs($admin)->get('/finance/tax-preview')->assertOk();
    }

    public function test_tax_preview_grant_includes_dependencies_without_transactions_or_account_detail(): void
    {
        $user = $this->userWithPermissions(['finance.tax-preview.view']);

        $this->assertEqualsCanonicalizing([
            'finance.access',
            'finance.accounts.basic',
            'finance.tax-preview.view',
        ], $user->effectiveFeaturePermissions());

        $this->actingAs($user)->get('/finance/tax-preview')->assertOk();
        $this->actingAs($user)->getJson('/api/finance/tax-preview-data')->assertOk();
        $this->actingAs($user)->get('/finance/accounts')->assertForbidden();
        $this->actingAs($user)->get('/finance/account/all/transactions')->assertForbidden();
        $this->actingAs($user)->getJson('/api/finance/all/line_items')->assertForbidden();
    }

    public function test_transactions_view_does_not_grant_import_or_mutation(): void
    {
        $user = $this->userWithPermissions(['finance.transactions.view']);
        $account = $this->createAccount($user);

        $this->actingAs($user)->get('/finance/account/all/transactions')->assertOk();
        $this->actingAs($user)->getJson('/api/finance/all/line_items')->assertOk();
        $this->actingAs($user)->get('/finance/account/all/import')->assertForbidden();
        $this->actingAs($user)->postJson("/api/finance/{$account->acct_id}/line_items", [])->assertForbidden();
    }

    public function test_transactions_import_includes_view_dependencies(): void
    {
        $user = $this->userWithPermissions(['finance.transactions.import']);

        $this->assertContains('finance.transactions.import', $user->effectiveFeaturePermissions());
        $this->assertContains('finance.transactions.view', $user->effectiveFeaturePermissions());
        $this->assertContains('finance.accounts.basic', $user->effectiveFeaturePermissions());
        $this->assertContains('finance.access', $user->effectiveFeaturePermissions());
    }

    public function test_basic_accounts_endpoint_is_sanitized_and_full_accounts_are_denied(): void
    {
        $user = $this->userWithPermissions(['finance.accounts.basic']);
        $this->createAccount($user);

        $response = $this->actingAs($user)->getJson('/api/finance/accounts/basic')->assertOk();
        $account = $response->json('accounts.0');

        $this->assertArrayHasKey('acct_id', $account);
        $this->assertArrayHasKey('acct_name', $account);
        $this->assertArrayNotHasKey('acct_number', $account);
        $this->assertArrayNotHasKey('acct_last_balance', $account);
        $this->assertArrayNotHasKey('expected_fee_pct', $account);
        $this->assertArrayNotHasKey('acct_capital_commitment', $account);

        $this->actingAs($user)->getJson('/api/finance/accounts')->assertForbidden();
    }

    public function test_rsu_view_does_not_grant_rsu_mutation(): void
    {
        $user = $this->userWithPermissions(['finance.rsu.view']);

        $this->actingAs($user)->get('/finance/rsu')->assertOk();
        $this->actingAs($user)->getJson('/api/rsu')->assertOk();
        $this->actingAs($user)->postJson('/api/rsu', [])->assertForbidden();
        $this->actingAs($user)->deleteJson('/api/rsu/1')->assertForbidden();
    }

    public function test_public_career_comparison_remains_public_for_guest_and_no_permission_user(): void
    {
        $user = User::factory()->create(['user_role' => 'user']);

        $this->get('/financial-planning/career-comparison')->assertOk();
        $this->actingAs($user)->get('/financial-planning/career-comparison')->assertOk();
        $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/latest/import-rsu', [])->assertForbidden();
        auth()->logout();
        $this->postJson('/api/financial-planning/career-comparison/latest/import-rsu', [])->assertUnauthorized();
    }

    public function test_genai_job_types_require_feature_permissions(): void
    {
        $user = User::factory()->create(['user_role' => 'user']);

        $this->actingAs($user)->postJson('/api/genai/import/request-upload', [
            'filename' => 'transactions.csv',
            'content_type' => 'text/csv',
            'file_size' => 128,
            'job_type' => 'finance_transactions',
        ])->assertForbidden();
    }

    /** @param list<string> $permissions */
    private function userWithPermissions(array $permissions): User
    {
        $user = User::factory()->create(['user_role' => 'user']);

        foreach ($permissions as $permission) {
            $this->grant($user, $permission);
        }

        return $user->refresh();
    }

    private function grant(User $user, string $permission): void
    {
        UserFeaturePermission::query()->create([
            'user_id' => $user->id,
            'permission' => $permission,
        ]);
    }

    private function createAccount(User $user): FinAccounts
    {
        return FinAccounts::withoutEvents(fn () => FinAccounts::query()->create([
            'acct_owner' => $user->id,
            'acct_name' => 'Test Account',
            'acct_number' => '123456789',
            'acct_last_balance' => '1234.56',
            'acct_last_balance_date' => now(),
            'acct_is_debt' => false,
            'acct_is_retirement' => false,
            'expected_fee_pct' => '0.0100',
            'expected_fee_flat' => '10.00',
            'acct_capital_commitment' => '1000.0000',
        ]));
    }
}
