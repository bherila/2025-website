<?php

namespace Tests\Feature\Finance;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserTaxStateControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->actingAs($this->user);
    }

    public function test_index_returns_empty_array_when_no_states(): void
    {
        $this->getJson('/api/finance/user-tax-states?year=2025')
            ->assertOk()
            ->assertExactJson([]);
    }

    public function test_store_adds_state_for_year(): void
    {
        $this->postJson('/api/finance/user-tax-states', [
            'tax_year' => 2025,
            'state_code' => 'CA',
        ])->assertCreated();

        $this->assertDatabaseHas('fin_user_tax_states', [
            'user_id' => $this->user->id,
            'tax_year' => 2025,
            'state_code' => 'CA',
        ]);
    }

    public function test_index_returns_states_for_year_only(): void
    {
        $this->postJson('/api/finance/user-tax-states', ['tax_year' => 2025, 'state_code' => 'CA']);
        $this->postJson('/api/finance/user-tax-states', ['tax_year' => 2025, 'state_code' => 'NY']);
        $this->postJson('/api/finance/user-tax-states', ['tax_year' => 2024, 'state_code' => 'CA']);

        $response = $this->getJson('/api/finance/user-tax-states?year=2025');
        $response->assertOk();
        $this->assertCount(2, $response->json());
        $this->assertContains('CA', $response->json());
        $this->assertContains('NY', $response->json());
    }

    public function test_store_is_idempotent(): void
    {
        $this->postJson('/api/finance/user-tax-states', ['tax_year' => 2025, 'state_code' => 'CA']);
        $this->postJson('/api/finance/user-tax-states', ['tax_year' => 2025, 'state_code' => 'CA']);

        $this->assertDatabaseCount('fin_user_tax_states', 1);
    }

    public function test_destroy_removes_state(): void
    {
        $this->postJson('/api/finance/user-tax-states', ['tax_year' => 2025, 'state_code' => 'CA']);
        $this->deleteJson('/api/finance/user-tax-states/CA?year=2025')->assertOk();
        $this->assertDatabaseMissing('fin_user_tax_states', ['state_code' => 'CA', 'tax_year' => 2025]);
    }

    public function test_destroy_does_not_affect_other_users(): void
    {
        $other = User::factory()->create();
        $this->actingAs($other);
        $this->postJson('/api/finance/user-tax-states', ['tax_year' => 2025, 'state_code' => 'CA']);

        $this->actingAs($this->user);
        $this->deleteJson('/api/finance/user-tax-states/CA?year=2025')->assertOk();

        $this->assertDatabaseHas('fin_user_tax_states', [
            'user_id' => $other->id,
            'state_code' => 'CA',
        ]);
    }

    public function test_store_rejects_invalid_state_code(): void
    {
        $this->postJson('/api/finance/user-tax-states', [
            'tax_year' => 2025,
            'state_code' => 'INVALID',
        ])->assertUnprocessable();
    }

    public function test_store_rejects_unsupported_state(): void
    {
        $this->postJson('/api/finance/user-tax-states', [
            'tax_year' => 2025,
            'state_code' => 'TX',
        ])->assertUnprocessable();
    }

    public function test_index_does_not_return_other_users_states(): void
    {
        $other = User::factory()->create();
        $this->actingAs($other);
        $this->postJson('/api/finance/user-tax-states', ['tax_year' => 2025, 'state_code' => 'CA']);

        $this->actingAs($this->user);
        $response = $this->getJson('/api/finance/user-tax-states?year=2025');
        $response->assertOk()->assertExactJson([]);
    }

    public function test_destroy_requires_year_param(): void
    {
        $this->postJson('/api/finance/user-tax-states', ['tax_year' => 2025, 'state_code' => 'CA']);
        $this->deleteJson('/api/finance/user-tax-states/CA')->assertUnprocessable();
    }
}
