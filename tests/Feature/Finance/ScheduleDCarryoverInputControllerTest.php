<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\ScheduleDCarryoverInput;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScheduleDCarryoverInputControllerTest extends TestCase
{
    use RefreshDatabase;

    private const string ENDPOINT = '/api/finance/schedule-d-carryovers';

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
    }

    public function test_unauthenticated_request_returns_401(): void
    {
        $this->getJson(self::ENDPOINT.'?year=2025')->assertUnauthorized();
    }

    public function test_get_returns_default_for_missing_input(): void
    {
        $this->actingAs($this->user)
            ->getJson(self::ENDPOINT.'?year=2025')
            ->assertOk()
            ->assertJsonPath('id', null)
            ->assertJsonPath('tax_year', 2025)
            ->assertJsonPath('short_term_loss_carryover', 0)
            ->assertJsonPath('long_term_loss_carryover', 0);
    }

    public function test_can_upsert_schedule_d_carryover_input(): void
    {
        $response = $this->actingAs($this->user)
            ->putJson(self::ENDPOINT, [
                'tax_year' => 2025,
                'short_term_loss_carryover' => 7000.25,
                'long_term_loss_carryover' => 2000,
                'notes' => 'From filed 2024 Schedule D worksheet.',
            ]);

        $response->assertOk()
            ->assertJsonPath('tax_year', 2025)
            ->assertJsonPath('short_term_loss_carryover', 7000.25)
            ->assertJsonPath('long_term_loss_carryover', 2000);

        $this->assertDatabaseHas('fin_schedule_d_carryover_inputs', [
            'user_id' => $this->user->id,
            'tax_year' => 2025,
            'short_term_loss_carryover' => 7000.25,
            'long_term_loss_carryover' => 2000,
        ]);
    }

    public function test_upsert_replaces_existing_year_input(): void
    {
        ScheduleDCarryoverInput::factory()->create([
            'user_id' => $this->user->id,
            'tax_year' => 2025,
            'short_term_loss_carryover' => 1000,
            'long_term_loss_carryover' => 2000,
        ]);

        $this->actingAs($this->user)
            ->putJson(self::ENDPOINT, [
                'tax_year' => 2025,
                'short_term_loss_carryover' => 3000,
                'long_term_loss_carryover' => 4000,
            ])
            ->assertOk()
            ->assertJsonPath('short_term_loss_carryover', 3000)
            ->assertJsonPath('long_term_loss_carryover', 4000);

        $this->assertDatabaseCount('fin_schedule_d_carryover_inputs', 1);
    }

    public function test_get_scopes_to_authenticated_user(): void
    {
        $otherUser = User::factory()->create();
        ScheduleDCarryoverInput::factory()->create([
            'user_id' => $otherUser->id,
            'tax_year' => 2025,
            'short_term_loss_carryover' => 9000,
            'long_term_loss_carryover' => 1000,
        ]);

        $this->actingAs($this->user)
            ->getJson(self::ENDPOINT.'?year=2025')
            ->assertOk()
            ->assertJsonPath('id', null)
            ->assertJsonPath('short_term_loss_carryover', 0);
    }

    public function test_rejects_negative_carryover_amounts(): void
    {
        $this->actingAs($this->user)
            ->putJson(self::ENDPOINT, [
                'tax_year' => 2025,
                'short_term_loss_carryover' => -1,
                'long_term_loss_carryover' => 0,
            ])
            ->assertUnprocessable();
    }
}
