<?php

namespace Database\Factories;

use App\Models\CareerJob;
use App\Services\Planning\OpportunityCost\JobSpec;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CareerJob>
 */
class CareerJobFactory extends Factory
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
            'kind' => 'hypothetical',
            'name' => fake()->jobTitle(),
            'spec_json' => JobSpec::defaults(false),
        ];
    }

    public function current(): static
    {
        return $this->state(fn (array $attributes): array => [
            'kind' => 'current',
            'name' => 'Current role',
            'spec_json' => JobSpec::defaults(true),
        ]);
    }
}
