<?php

namespace Database\Factories;

use App\Models\CareerComparison;
use App\Support\ShortCode;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CareerComparison>
 */
class CareerComparisonFactory extends Factory
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
            'title' => null,
            'is_snapshot' => true,
            'last_active_at' => null,
            'current_job_id' => null,
            'current_job_ids' => [],
            'hypothetical_job_ids' => [],
            'short_code' => ShortCode::generate(
                fn (string $code): bool => CareerComparison::query()->where('short_code', $code)->exists(),
            ),
            'share_includes_current' => true,
            'computed_json' => null,
        ];
    }
}
