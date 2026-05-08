<?php

namespace Tests\Feature\Finance;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TaxLineAdjustmentControllerTest extends TestCase
{
    public function test_unauthenticated_request_returns_401(): void
    {
        $this->getJson('/api/finance/tax-line-adjustments?year=2025')->assertUnauthorized();
    }

    public function test_can_create_update_list_and_delete_adjustment(): void
    {
        $user = $this->createUser();
        $entityId = $this->createScheduleCEntity($user->id);

        $create = $this->actingAs($user)->postJson('/api/finance/tax-line-adjustments', [
            'tax_year' => 2025,
            'form' => 'schedule_c',
            'entity_id' => $entityId,
            'line_ref' => 'line_30',
            'kind' => 'override',
            'amount' => 1234.56,
            'description' => 'Match filed return.',
        ]);

        $create->assertCreated()
            ->assertJsonPath('form', 'schedule_c')
            ->assertJsonPath('line_ref', 'line_30')
            ->assertJsonPath('amount', 1234.56);

        $id = $create->json('id');

        $this->actingAs($user)
            ->patchJson("/api/finance/tax-line-adjustments/{$id}", [
                'status' => 'applied',
            ])
            ->assertOk()
            ->assertJsonPath('status', 'applied');

        $this->actingAs($user)
            ->getJson("/api/finance/tax-line-adjustments?year=2025&form=schedule_c&entity_id={$entityId}")
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.status', 'applied');

        $this->actingAs($user)
            ->deleteJson("/api/finance/tax-line-adjustments/{$id}")
            ->assertOk();

        $this->assertDatabaseMissing('fin_tax_line_adjustments', ['id' => $id]);
    }

    public function test_requires_amount_for_numeric_adjustments(): void
    {
        $user = $this->createUser();
        $entityId = $this->createScheduleCEntity($user->id);

        $this->actingAs($user)
            ->postJson('/api/finance/tax-line-adjustments', [
                'tax_year' => 2025,
                'form' => 'schedule_c',
                'entity_id' => $entityId,
                'line_ref' => 'line_30',
                'kind' => 'override',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['amount']);
    }

    public function test_rejects_other_users_entity(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();
        $entityId = $this->createScheduleCEntity($otherUser->id);

        $this->actingAs($user)
            ->postJson('/api/finance/tax-line-adjustments', [
                'tax_year' => 2025,
                'form' => 'schedule_c',
                'entity_id' => $entityId,
                'line_ref' => 'line_30',
                'kind' => 'follow_up_flag',
                'description' => 'Review.',
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
