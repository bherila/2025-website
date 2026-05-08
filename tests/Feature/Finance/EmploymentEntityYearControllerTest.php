<?php

namespace Tests\Feature\Finance;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class EmploymentEntityYearControllerTest extends TestCase
{
    public function test_unauthenticated_request_returns_401(): void
    {
        $this->getJson('/api/finance/employment-entities/1/years')->assertUnauthorized();
    }

    public function test_can_upsert_and_list_schedule_c_entity_year_details(): void
    {
        $user = $this->createUser();
        $entityId = $this->createScheduleCEntity($user->id);

        $response = $this->actingAs($user)->putJson("/api/finance/employment-entities/{$entityId}/years/2025", [
            'accounting_method' => 'cash',
            'materially_participated' => true,
            'made_payments_requiring_1099' => true,
            'filed_required_1099s' => false,
            'started_or_acquired_this_year' => false,
            'principal_product_service' => 'Software consulting',
            'business_code' => '541511',
            'notes' => 'Filed return value.',
        ]);

        $response->assertOk()
            ->assertJsonPath('tax_year', 2025)
            ->assertJsonPath('business_code', '541511')
            ->assertJsonPath('made_payments_requiring_1099', true);

        $this->assertDatabaseHas('fin_employment_entity_year', [
            'employment_entity_id' => $entityId,
            'tax_year' => 2025,
            'principal_product_service' => 'Software consulting',
        ]);

        $this->actingAs($user)
            ->getJson("/api/finance/employment-entities/{$entityId}/years?year=2025")
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.business_code', '541511');
    }

    public function test_rejects_other_users_entity(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();
        $entityId = $this->createScheduleCEntity($otherUser->id);

        $this->actingAs($user)
            ->putJson("/api/finance/employment-entities/{$entityId}/years/2025", [
                'accounting_method' => 'cash',
            ])
            ->assertNotFound();
    }

    public function test_validates_business_code(): void
    {
        $user = $this->createUser();
        $entityId = $this->createScheduleCEntity($user->id);

        $this->actingAs($user)
            ->putJson("/api/finance/employment-entities/{$entityId}/years/2025", [
                'business_code' => 'ABC',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['business_code']);
    }

    public function test_rejects_invalid_year_query(): void
    {
        $user = $this->createUser();
        $entityId = $this->createScheduleCEntity($user->id);

        $this->actingAs($user)
            ->getJson("/api/finance/employment-entities/{$entityId}/years?year=1900")
            ->assertStatus(422);
    }

    public function test_rejects_invalid_route_year_on_update(): void
    {
        $user = $this->createUser();
        $entityId = $this->createScheduleCEntity($user->id);

        $this->actingAs($user)
            ->putJson("/api/finance/employment-entities/{$entityId}/years/1900", [
                'accounting_method' => 'cash',
            ])
            ->assertStatus(422);

        $this->assertDatabaseMissing('fin_employment_entity_year', [
            'employment_entity_id' => $entityId,
            'tax_year' => 1900,
        ]);
    }

    public function test_rejects_invalid_route_year_on_destroy(): void
    {
        $user = $this->createUser();
        $entityId = $this->createScheduleCEntity($user->id);

        DB::table('fin_employment_entity_year')->insert([
            'employment_entity_id' => $entityId,
            'tax_year' => 2025,
            'accounting_method' => 'cash',
            'materially_participated' => true,
            'made_payments_requiring_1099' => false,
            'filed_required_1099s' => null,
            'started_or_acquired_this_year' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($user)
            ->deleteJson("/api/finance/employment-entities/{$entityId}/years/1900")
            ->assertStatus(422);

        $this->assertDatabaseHas('fin_employment_entity_year', [
            'employment_entity_id' => $entityId,
            'tax_year' => 2025,
        ]);
    }

    public function test_filed_required_1099s_can_remain_unknown(): void
    {
        $user = $this->createUser();
        $entityId = $this->createScheduleCEntity($user->id);

        $this->actingAs($user)
            ->putJson("/api/finance/employment-entities/{$entityId}/years/2025", [
                'accounting_method' => 'cash',
                'made_payments_requiring_1099' => true,
            ])
            ->assertOk()
            ->assertJsonPath('filed_required_1099s', null);

        $this->assertDatabaseHas('fin_employment_entity_year', [
            'employment_entity_id' => $entityId,
            'tax_year' => 2025,
            'filed_required_1099s' => null,
        ]);
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
