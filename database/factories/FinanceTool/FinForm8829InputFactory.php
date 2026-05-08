<?php

namespace Database\Factories\FinanceTool;

use App\Models\FinanceTool\FinForm8829Input;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\DB;

/**
 * @extends Factory<FinForm8829Input>
 */
class FinForm8829InputFactory extends Factory
{
    protected $model = FinForm8829Input::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $user = User::factory()->create();

        return [
            'user_id' => $user->id,
            'employment_entity_id' => $this->scheduleCEntityId((int) $user->id),
            'tax_year' => fake()->numberBetween(2023, 2026),
            'method' => 'regular',
            'office_sqft' => fake()->randomFloat(2, 80, 250),
            'home_sqft' => fake()->randomFloat(2, 900, 2500),
            'months_used' => 12,
            'prior_year_op_carryover' => 0,
            'prior_year_op_carryover_ca' => 0,
            'prior_year_depreciation_carryover' => 0,
            'prior_year_depreciation_carryover_ca' => 0,
            'notes' => fake()->optional()->sentence(),
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
