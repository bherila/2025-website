<?php

namespace Tests\Feature\Finance;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserDeductionControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->actingAs($this->user);
    }

    public function test_index_returns_empty_for_new_user(): void
    {
        $this->getJson('/api/finance/user-deductions?year=2025')
            ->assertOk()
            ->assertExactJson([]);
    }

    public function test_store_creates_deduction(): void
    {
        $this->postJson('/api/finance/user-deductions', [
            'tax_year' => 2025,
            'category' => 'real_estate_tax',
            'description' => '123 Main St',
            'amount' => 4500.00,
        ])->assertCreated()
            ->assertJsonFragment(['category' => 'real_estate_tax', 'amount' => 4500.0]);

        $this->assertDatabaseHas('fin_user_deductions', [
            'user_id' => $this->user->id,
            'tax_year' => 2025,
            'category' => 'real_estate_tax',
            'amount' => 4500.00,
        ]);
    }

    public function test_index_scopes_to_year(): void
    {
        $this->postJson('/api/finance/user-deductions', ['tax_year' => 2025, 'category' => 'real_estate_tax', 'amount' => 1000]);
        $this->postJson('/api/finance/user-deductions', ['tax_year' => 2024, 'category' => 'real_estate_tax', 'amount' => 2000]);

        $response = $this->getJson('/api/finance/user-deductions?year=2025');
        $response->assertOk();
        $this->assertCount(1, $response->json());
    }

    public function test_update_modifies_deduction(): void
    {
        $create = $this->postJson('/api/finance/user-deductions', [
            'tax_year' => 2025,
            'category' => 'real_estate_tax',
            'amount' => 1000,
        ]);
        $id = $create->json('id');

        $this->putJson("/api/finance/user-deductions/{$id}", ['amount' => 2500])
            ->assertOk()
            ->assertJsonFragment(['amount' => 2500.0]);
    }

    public function test_destroy_removes_deduction(): void
    {
        $create = $this->postJson('/api/finance/user-deductions', [
            'tax_year' => 2025,
            'category' => 'charitable_cash',
            'amount' => 500,
        ]);
        $id = $create->json('id');

        $this->deleteJson("/api/finance/user-deductions/{$id}")->assertOk();
        $this->assertDatabaseMissing('fin_user_deductions', ['id' => $id]);
    }

    public function test_cannot_modify_another_users_deduction(): void
    {
        $other = User::factory()->create();
        $this->actingAs($other);
        $create = $this->postJson('/api/finance/user-deductions', [
            'tax_year' => 2025,
            'category' => 'real_estate_tax',
            'amount' => 1000,
        ]);
        $id = $create->json('id');

        $this->actingAs($this->user);
        $this->putJson("/api/finance/user-deductions/{$id}", ['amount' => 9999])->assertNotFound();
        $this->deleteJson("/api/finance/user-deductions/{$id}")->assertNotFound();
    }

    public function test_store_rejects_invalid_category(): void
    {
        $this->postJson('/api/finance/user-deductions', [
            'tax_year' => 2025,
            'category' => 'not_a_valid_category',
            'amount' => 100,
        ])->assertUnprocessable();
    }

    public function test_store_rejects_zero_amount(): void
    {
        $this->postJson('/api/finance/user-deductions', [
            'tax_year' => 2025,
            'category' => 'real_estate_tax',
            'amount' => 0,
        ])->assertUnprocessable();
    }

    public function test_index_does_not_return_other_users_deductions(): void
    {
        $other = User::factory()->create();
        $this->actingAs($other);
        $this->postJson('/api/finance/user-deductions', [
            'tax_year' => 2025,
            'category' => 'real_estate_tax',
            'amount' => 5000,
        ]);

        $this->actingAs($this->user);
        $this->getJson('/api/finance/user-deductions?year=2025')
            ->assertOk()
            ->assertExactJson([]);
    }

    public function test_update_ignores_tax_year_field(): void
    {
        $create = $this->postJson('/api/finance/user-deductions', [
            'tax_year' => 2025,
            'category' => 'real_estate_tax',
            'amount' => 1000,
        ]);
        $id = $create->json('id');

        // Attempting to change tax_year should be silently ignored
        $this->putJson("/api/finance/user-deductions/{$id}", [
            'tax_year' => 2020,
            'amount' => 2000,
        ])->assertOk();

        $this->assertDatabaseHas('fin_user_deductions', [
            'id' => $id,
            'tax_year' => 2025, // unchanged
            'amount' => 2000,
        ]);
    }
}
