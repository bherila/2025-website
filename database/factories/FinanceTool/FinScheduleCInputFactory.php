<?php

namespace Database\Factories\FinanceTool;

use App\Models\FinanceTool\FinScheduleCInput;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<FinScheduleCInput>
 */
class FinScheduleCInputFactory extends Factory
{
    use CreatesScheduleCEmploymentEntities;

    protected $model = FinScheduleCInput::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'employment_entity_id' => fn (array $attributes): int => $this->scheduleCEntityIdForUser((int) $attributes['user_id']),
            'tax_year' => fake()->numberBetween(2023, 2026),
            'gross_receipts' => fake()->randomFloat(2, 1000, 200000),
            'returns_and_allowances' => 0,
            'other_income' => null,
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
