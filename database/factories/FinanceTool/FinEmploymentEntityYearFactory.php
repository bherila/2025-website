<?php

namespace Database\Factories\FinanceTool;

use App\Models\FinanceTool\FinEmploymentEntityYear;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<FinEmploymentEntityYear>
 */
class FinEmploymentEntityYearFactory extends Factory
{
    use CreatesScheduleCEmploymentEntities;

    protected $model = FinEmploymentEntityYear::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'employment_entity_id' => fn (): int => $this->scheduleCEntityIdForUser((int) User::factory()->create()->getKey()),
            'tax_year' => fake()->numberBetween(2023, 2026),
            'accounting_method' => 'cash',
            'materially_participated' => true,
            'made_payments_requiring_1099' => false,
            'filed_required_1099s' => null,
            'started_or_acquired_this_year' => false,
            'principal_product_service' => fake()->optional()->sentence(3),
            'business_code' => fake()->optional()->numerify('######'),
            'notes' => fake()->optional()->sentence(),
        ];
    }

    public function forUser(User|int $user): static
    {
        $userId = $user instanceof User ? (int) $user->id : $user;

        return $this->state(fn (): array => [
            'employment_entity_id' => $this->scheduleCEntityIdForUser($userId),
        ]);
    }
}
