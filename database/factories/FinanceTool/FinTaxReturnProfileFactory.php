<?php

namespace Database\Factories\FinanceTool;

use App\Models\FinanceTool\FinTaxReturnProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<FinTaxReturnProfile>
 */
class FinTaxReturnProfileFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'tax_year' => 2025,
            'filing_status' => 'single',
            'taxpayer_first_name' => fake()->firstName(),
            'taxpayer_last_name' => fake()->lastName(),
            'taxpayer_ssn' => '123-45-6789',
            'address_line1' => fake()->streetAddress(),
            'city' => fake()->city(),
            'state' => fake()->stateAbbr(),
            'postal_code' => fake()->postcode(),
            'digital_assets_answer' => 'no',
            'taxpayer_occupation' => fake()->jobTitle(),
            'phone' => fake()->phoneNumber(),
            'email' => fake()->safeEmail(),
            'dependents_json' => [],
            'third_party_designee_json' => [],
        ];
    }
}
