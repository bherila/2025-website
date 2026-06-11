<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountNumberMetadataTest extends TestCase
{
    use RefreshDatabase;

    public function test_create_account_with_acct_number_stores_it(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/finance/accounts', [
            'accountName' => 'Test Brokerage',
            'isDebt' => false,
            'isRetirement' => false,
            'acctNumber' => '6789',
        ]);

        $response->assertOk()->assertJson(['success' => true]);

        $account = FinAccounts::where('acct_owner', $user->id)
            ->where('acct_name', 'Test Brokerage')
            ->firstOrFail();

        $this->assertSame('6789', $account->acct_number);
    }

    public function test_create_account_without_acct_number_is_backward_compatible(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/finance/accounts', [
            'accountName' => 'Legacy Account',
            'isDebt' => false,
            'isRetirement' => false,
        ]);

        $response->assertOk()->assertJson(['success' => true]);

        $account = FinAccounts::where('acct_owner', $user->id)
            ->where('acct_name', 'Legacy Account')
            ->firstOrFail();

        $this->assertNull($account->acct_number);
    }

    public function test_create_account_trims_acct_number_input(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/finance/accounts', [
            'accountName' => 'Padded Number Account',
            'isDebt' => false,
            'isRetirement' => false,
            'acctNumber' => '  1234  ',
        ]);

        $response->assertOk();

        $account = FinAccounts::where('acct_owner', $user->id)
            ->where('acct_name', 'Padded Number Account')
            ->firstOrFail();

        $this->assertSame('1234', $account->acct_number);
    }

    public function test_create_account_with_empty_acct_number_stores_null(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/finance/accounts', [
            'accountName' => 'Empty Number Account',
            'isDebt' => false,
            'isRetirement' => false,
            'acctNumber' => '',
        ]);

        $response->assertOk();

        $account = FinAccounts::where('acct_owner', $user->id)
            ->where('acct_name', 'Empty Number Account')
            ->firstOrFail();

        $this->assertNull($account->acct_number);
    }

    public function test_basic_accounts_exposes_last4_not_full_number(): void
    {
        $user = User::factory()->create();
        $account = $this->createAccount($user, ['acct_number' => '123456789']);

        $response = $this->actingAs($user)->getJson('/api/finance/accounts/basic');

        $response->assertOk();
        /** @var array<int, array<string, mixed>> $accounts */
        $accounts = $response->json('accounts');
        $match = collect($accounts)->firstWhere('acct_id', $account->acct_id);

        $this->assertNotNull($match);
        $this->assertSame('6789', $match['acct_number_last4']);
        $this->assertArrayNotHasKey('acct_number', $match);
    }

    public function test_basic_accounts_returns_null_last4_when_no_number(): void
    {
        $user = User::factory()->create();
        $account = $this->createAccount($user, ['acct_number' => null]);

        $response = $this->actingAs($user)->getJson('/api/finance/accounts/basic');

        $response->assertOk();
        /** @var array<int, array<string, mixed>> $accounts */
        $accounts = $response->json('accounts');
        $match = collect($accounts)->firstWhere('acct_id', $account->acct_id);

        $this->assertNotNull($match);
        $this->assertNull($match['acct_number_last4']);
    }

    public function test_update_flags_updates_acct_number(): void
    {
        $user = User::factory()->create();
        $account = $this->createAccount($user, ['acct_number' => null]);

        $response = $this->actingAs($user)->postJson("/api/finance/{$account->acct_id}/update-flags", [
            'isDebt' => false,
            'isRetirement' => false,
            'acctNumber' => '4321',
        ]);

        $response->assertOk()->assertJson(['success' => true]);

        $account->refresh();
        $this->assertSame('4321', $account->acct_number);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createAccount(User $user, array $overrides = []): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate(array_merge([
            'acct_owner' => $user->id,
            'acct_name' => fake()->unique()->word(),
            'acct_last_balance' => '0',
        ], $overrides)));
    }
}
