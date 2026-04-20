<?php

namespace Database\Factories\FinanceTool;

use App\Models\FinanceTool\PalCarryforward;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PalCarryforward>
 */
class PalCarryforwardFactory extends Factory
{
    protected $model = PalCarryforward::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'tax_year' => fake()->numberBetween(2023, 2026),
            'activity_name' => fake()->company(),
            'activity_ein' => fake()->optional()->numerify('##-#######'),
            'ordinary_carryover' => fake()->randomFloat(2, -50000, 0),
            'short_term_carryover' => 0,
            'long_term_carryover' => 0,
        ];
    }

    public function forYear(int $year): self
    {
        return $this->state(fn () => ['tax_year' => $year]);
    }
}
