<?php

namespace Database\Factories;

use App\Models\ToonDocument;
use App\Support\ShortCode;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ToonDocument>
 */
class ToonDocumentFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->word();
        $value = fake()->numberBetween(1, 100);

        return [
            'user_id' => null,
            'short_code' => ShortCode::generate(
                fn (string $code): bool => ToonDocument::query()->where('short_code', $code)->exists(),
            ),
            'title' => fake()->sentence(3),
            'toon_content' => "{$name}: {$value}",
        ];
    }
}
