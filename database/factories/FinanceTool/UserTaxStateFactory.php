<?php

namespace Database\Factories\FinanceTool;

use App\Enums\Finance\TaxState;
use App\Models\FinanceTool\UserTaxState;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<UserTaxState>
 */
class UserTaxStateFactory extends Factory
{
    protected $model = UserTaxState::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'tax_year' => fake()->numberBetween(2023, 2026),
            'state_code' => fake()->randomElement(TaxState::values()),
        ];
    }

    public function forYear(int $year): self
    {
        return $this->state(fn () => ['tax_year' => $year]);
    }

    public function state_code(TaxState|string $state): self
    {
        $value = $state instanceof TaxState ? $state->value : $state;

        return $this->state(fn () => ['state_code' => $value]);
    }
}
