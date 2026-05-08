<?php

namespace Tests\Feature\Finance;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class Form8829InputControllerTest extends TestCase
{
    public function test_unauthenticated_request_returns_401(): void
    {
        $this->getJson('/api/finance/form-8829?year=2025')->assertUnauthorized();
    }

    public function test_get_returns_default_for_missing_entity_input(): void
    {
        $user = $this->createUser();
        $entityId = $this->createScheduleCEntity($user->id);

        $this->actingAs($user)
            ->getJson("/api/finance/form-8829?entity_id={$entityId}&year=2025")
            ->assertOk()
            ->assertJsonPath('id', null)
            ->assertJsonPath('employment_entity_id', $entityId)
            ->assertJsonPath('method', 'regular')
            ->assertJsonPath('months_used', 12);
    }

    public function test_can_upsert_form_8829_inputs(): void
    {
        $user = $this->createUser();
        $entityId = $this->createScheduleCEntity($user->id);

        $response = $this->actingAs($user)->putJson('/api/finance/form-8829', [
            'entity_id' => $entityId,
            'tax_year' => 2025,
            'method' => 'regular',
            'office_sqft' => 150,
            'home_sqft' => 1200,
            'months_used' => 10,
            'prior_year_op_carryover' => 12738,
            'prior_year_op_carryover_ca' => 200,
            'prior_year_depreciation_carryover' => 300,
            'prior_year_depreciation_carryover_ca' => 400,
            'notes' => 'Filed carryover.',
        ]);

        $response->assertOk()
            ->assertJsonPath('employment_entity_id', $entityId)
            ->assertJsonPath('office_sqft', 150)
            ->assertJsonPath('months_used', 10)
            ->assertJsonPath('prior_year_op_carryover', 12738);

        $this->assertDatabaseHas('fin_form_8829_inputs', [
            'user_id' => $user->id,
            'employment_entity_id' => $entityId,
            'tax_year' => 2025,
            'method' => 'regular',
        ]);
    }

    public function test_rejects_other_users_entity(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();
        $entityId = $this->createScheduleCEntity($otherUser->id);

        $this->actingAs($user)
            ->putJson('/api/finance/form-8829', [
                'entity_id' => $entityId,
                'tax_year' => 2025,
                'method' => 'regular',
                'months_used' => 12,
            ])
            ->assertNotFound();
    }

    private function createScheduleCEntity(int $userId): int
    {
        return (int) DB::table('fin_employment_entity')->insertGetId([
            'user_id' => $userId,
            'display_name' => 'Consulting LLC',
            'start_date' => '2024-01-01',
            'type' => 'sch_c',
            'is_current' => true,
            'is_spouse' => false,
            'is_hidden' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
