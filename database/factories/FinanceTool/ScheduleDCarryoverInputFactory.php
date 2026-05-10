<?php

namespace Database\Factories\FinanceTool;

use App\Models\FinanceTool\ScheduleDCarryoverInput;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ScheduleDCarryoverInput>
 */
class ScheduleDCarryoverInputFactory extends Factory
{
    protected $model = ScheduleDCarryoverInput::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'tax_year' => fake()->numberBetween(2023, 2026),
            'short_term_loss_carryover' => fake()->randomFloat(2, 0, 50000),
            'long_term_loss_carryover' => fake()->randomFloat(2, 0, 50000),
            'notes' => fake()->optional()->sentence(),
        ];
    }

    public function forYear(int $year): static
    {
        return $this->state(fn (): array => ['tax_year' => $year]);
    }
}
