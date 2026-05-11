<?php

namespace Database\Factories;

use App\Models\FinPlanningRothScenario;
use App\Services\Planning\RothConversionInputs;
use App\Support\ShortCode;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<FinPlanningRothScenario>
 */
class FinPlanningRothScenarioFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => null,
            'short_code' => ShortCode::generate(
                fn (string $code): bool => FinPlanningRothScenario::query()->where('short_code', $code)->exists(),
            ),
            'title' => fake()->sentence(3),
            'inputs_json' => RothConversionInputs::defaults(),
            'computed_json' => null,
        ];
    }
}
