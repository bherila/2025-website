<?php

namespace Database\Factories\FinanceTool;

use App\Models\FinanceTool\FinTaxLineAdjustment;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<FinTaxLineAdjustment>
 */
class FinTaxLineAdjustmentFactory extends Factory
{
    use CreatesScheduleCEmploymentEntities;

    protected $model = FinTaxLineAdjustment::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'tax_year' => fake()->numberBetween(2023, 2026),
            'form' => 'schedule_c',
            'entity_id' => fn (array $attributes): int => $this->scheduleCEntityIdForUser((int) $attributes['user_id']),
            'line_ref' => 'line_30',
            'kind' => 'adjustment',
            'amount' => fake()->randomFloat(2, -500, 500),
            'description' => fake()->sentence(),
            'status' => 'open',
        ];
    }

    public function forUser(User|int $user): static
    {
        $userId = $user instanceof User ? (int) $user->id : $user;

        return $this->state(fn (): array => [
            'user_id' => $userId,
            'entity_id' => $this->scheduleCEntityIdForUser($userId),
        ]);
    }
}
