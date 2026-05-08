<?php

namespace Database\Factories\FinanceTool;

use App\Models\FinanceTool\FinTaxLineAdjustment;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\DB;

/**
 * @extends Factory<FinTaxLineAdjustment>
 */
class FinTaxLineAdjustmentFactory extends Factory
{
    protected $model = FinTaxLineAdjustment::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $user = User::factory()->create();

        return [
            'user_id' => $user->id,
            'tax_year' => fake()->numberBetween(2023, 2026),
            'form' => 'schedule_c',
            'entity_id' => $this->scheduleCEntityId((int) $user->id),
            'line_ref' => 'line_30',
            'kind' => 'adjustment',
            'amount' => fake()->randomFloat(2, -500, 500),
            'description' => fake()->sentence(),
            'status' => 'open',
        ];
    }

    private function scheduleCEntityId(int $userId): int
    {
        return (int) DB::table('fin_employment_entity')->insertGetId([
            'user_id' => $userId,
            'display_name' => fake()->company(),
            'start_date' => '2024-01-01',
            'is_current' => true,
            'type' => 'sch_c',
            'is_spouse' => false,
            'is_hidden' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
