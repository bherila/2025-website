<?php

namespace Database\Factories\FinanceTool;

use App\Models\FinanceTool\FinForm8829Input;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<FinForm8829Input>
 */
class FinForm8829InputFactory extends Factory
{
    use CreatesScheduleCEmploymentEntities;

    protected $model = FinForm8829Input::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'employment_entity_id' => fn (array $attributes): int => $this->scheduleCEntityIdForUser((int) $attributes['user_id']),
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

    public function forUser(User|int $user): static
    {
        $userId = $user instanceof User ? (int) $user->id : $user;

        return $this->state(fn (): array => [
            'user_id' => $userId,
            'employment_entity_id' => $this->scheduleCEntityIdForUser($userId),
        ]);
    }
}
