<?php

namespace Database\Factories\FinanceTool;

use App\Enums\Finance\DeductionCategory;
use App\Models\FinanceTool\UserDeduction;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<UserDeduction>
 */
class UserDeductionFactory extends Factory
{
    protected $model = UserDeduction::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'tax_year' => fake()->numberBetween(2023, 2026),
            'category' => fake()->randomElement(DeductionCategory::values()),
            'description' => fake()->optional()->sentence(3),
            'amount' => fake()->randomFloat(2, 100, 15_000),
        ];
    }

    public function forYear(int $year): self
    {
        return $this->state(fn () => ['tax_year' => $year]);
    }

    public function category(DeductionCategory|string $category): self
    {
        $value = $category instanceof DeductionCategory ? $category->value : $category;

        return $this->state(fn () => ['category' => $value]);
    }
}
