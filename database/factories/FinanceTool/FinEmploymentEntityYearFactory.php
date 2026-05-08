<?php

namespace Database\Factories\FinanceTool;

use App\Models\FinanceTool\FinEmploymentEntityYear;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\DB;

/**
 * @extends Factory<FinEmploymentEntityYear>
 */
class FinEmploymentEntityYearFactory extends Factory
{
    protected $model = FinEmploymentEntityYear::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'employment_entity_id' => $this->scheduleCEntityId(),
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

    private function scheduleCEntityId(): int
    {
        $user = User::factory()->create();

        return (int) DB::table('fin_employment_entity')->insertGetId([
            'user_id' => $user->id,
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
