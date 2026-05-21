<?php

namespace Database\Factories;

use App\Models\MarkdownDocument;
use App\Support\ShortCode;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MarkdownDocument>
 */
class MarkdownDocumentFactory extends Factory
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
            'short_code' => ShortCode::generate(
                fn (string $code): bool => MarkdownDocument::query()->where('short_code', $code)->exists(),
            ),
            'title' => fake()->sentence(3),
            'markdown_content' => '# '.fake()->sentence(4)."\n\n".fake()->paragraph(3),
        ];
    }
}
