<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\PalCarryforward;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PalCarryforwardControllerTest extends TestCase
{
    use RefreshDatabase;

    private const ENDPOINT = '/api/finance/tax-loss-carryforwards';

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->actingAs($this->user);
    }

    public function test_index_returns_empty_for_new_user(): void
    {
        $this->getJson(self::ENDPOINT.'?year=2025')
            ->assertOk()
            ->assertExactJson([]);
    }

    public function test_store_creates_carryforward(): void
    {
        $this->postJson(self::ENDPOINT, [
            'tax_year' => 2025,
            'activity_name' => 'AQR Diversified Arbitrage Fund',
            'activity_ein' => '20-1234567',
            'ordinary_carryover' => -6280.00,
            'short_term_carryover' => 0,
            'long_term_carryover' => 0,
        ])->assertCreated()
            ->assertJsonFragment([
                'activity_name' => 'AQR Diversified Arbitrage Fund',
                'ordinary_carryover' => -6280.0,
            ]);

        $this->assertDatabaseHas('fin_pal_carryforwards', [
            'user_id' => $this->user->id,
            'tax_year' => 2025,
            'activity_name' => 'AQR Diversified Arbitrage Fund',
            'ordinary_carryover' => -6280.00,
        ]);
    }

    public function test_store_upserts_existing_carryforward_for_same_year_and_activity(): void
    {
        $this->postJson(self::ENDPOINT, [
            'tax_year' => 2025,
            'activity_name' => 'Fund A',
            'ordinary_carryover' => -1000,
        ])->assertCreated();

        $this->postJson(self::ENDPOINT, [
            'tax_year' => 2025,
            'activity_name' => 'Fund A',
            'activity_ein' => '12-3456789',
            'ordinary_carryover' => -2500,
        ])->assertOk()
            ->assertJsonFragment([
                'activity_name' => 'Fund A',
                'activity_ein' => '12-3456789',
                'ordinary_carryover' => -2500.0,
            ]);

        $this->assertDatabaseCount('fin_pal_carryforwards', 1);
        $this->assertDatabaseHas('fin_pal_carryforwards', [
            'user_id' => $this->user->id,
            'tax_year' => 2025,
            'activity_name' => 'Fund A',
            'activity_ein' => '12-3456789',
            'ordinary_carryover' => -2500.00,
        ]);
    }

    public function test_index_scopes_to_year(): void
    {
        $this->postJson(self::ENDPOINT, [
            'tax_year' => 2025,
            'activity_name' => 'Fund A',
            'ordinary_carryover' => -1000,
        ]);
        $this->postJson(self::ENDPOINT, [
            'tax_year' => 2024,
            'activity_name' => 'Fund B',
            'ordinary_carryover' => -2000,
        ]);

        $response = $this->getJson(self::ENDPOINT.'?year=2025');
        $response->assertOk();
        $this->assertCount(1, $response->json());
    }

    public function test_update_modifies_carryforward(): void
    {
        $create = $this->postJson(self::ENDPOINT, [
            'tax_year' => 2025,
            'activity_name' => 'Fund A',
            'ordinary_carryover' => -1000,
        ]);
        $id = $create->json('id');

        $this->putJson(self::ENDPOINT."/{$id}", ['ordinary_carryover' => -2500])
            ->assertOk()
            ->assertJsonFragment(['ordinary_carryover' => -2500.0]);
    }

    public function test_destroy_removes_carryforward(): void
    {
        $create = $this->postJson(self::ENDPOINT, [
            'tax_year' => 2025,
            'activity_name' => 'Fund A',
            'ordinary_carryover' => -500,
        ]);
        $id = $create->json('id');

        $this->deleteJson(self::ENDPOINT."/{$id}")->assertOk();
        $this->assertDatabaseMissing('fin_pal_carryforwards', ['id' => $id]);
    }

    public function test_cannot_modify_another_users_carryforward(): void
    {
        $other = User::factory()->create();
        $this->actingAs($other);
        $create = $this->postJson(self::ENDPOINT, [
            'tax_year' => 2025,
            'activity_name' => 'Fund A',
            'ordinary_carryover' => -1000,
        ]);
        $id = $create->json('id');

        $this->actingAs($this->user);
        $this->putJson(self::ENDPOINT."/{$id}", ['ordinary_carryover' => -9999])->assertNotFound();
        $this->deleteJson(self::ENDPOINT."/{$id}")->assertNotFound();
    }

    public function test_store_rejects_missing_activity_name(): void
    {
        $this->postJson(self::ENDPOINT, [
            'tax_year' => 2025,
            'ordinary_carryover' => -100,
        ])->assertUnprocessable();
    }

    public function test_response_amounts_are_json_numbers(): void
    {
        $response = $this->postJson(self::ENDPOINT, [
            'tax_year' => 2025,
            'activity_name' => 'Fund A',
            'ordinary_carryover' => -1234.56,
        ]);

        $response->assertCreated();
        $this->assertIsFloat($response->json('ordinary_carryover'));
        $this->assertEqualsWithDelta(-1234.56, $response->json('ordinary_carryover'), 0.001);
    }

    public function test_factory_can_create_persisted_carryforward(): void
    {
        $carryforward = PalCarryforward::factory()->forYear(2025)->create([
            'user_id' => $this->user->id,
        ]);

        $this->assertDatabaseHas('fin_pal_carryforwards', [
            'id' => $carryforward->id,
            'user_id' => $this->user->id,
            'tax_year' => 2025,
        ]);
    }
}
