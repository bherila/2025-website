<?php

namespace Database\Factories;

use App\Models\OpportunityCostComparison;
use App\Support\ShortCode;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OpportunityCostComparison>
 */
class OpportunityCostComparisonFactory extends Factory
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
            'current_job_id' => null,
            'hypothetical_job_ids' => [],
            'short_code' => ShortCode::generate(
                fn (string $code): bool => OpportunityCostComparison::query()->where('short_code', $code)->exists(),
            ),
            'share_includes_current' => true,
            'computed_json' => null,
        ];
    }
}
