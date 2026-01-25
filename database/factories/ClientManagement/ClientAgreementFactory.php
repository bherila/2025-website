<?php

namespace Database\Factories\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\ClientManagement\ClientAgreement>
 */
class ClientAgreementFactory extends Factory
{
    protected $model = ClientAgreement::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'client_company_id' => ClientCompany::factory(),
            'active_date' => fake()->dateTimeBetween('-1 year', 'now'),
            'termination_date' => null,
            'agreement_text' => fake()->paragraphs(3, true),
            'agreement_link' => fake()->optional()->url(),
            'monthly_retainer_hours' => fake()->randomElement([0, 5, 10, 20, 40]),
            'rollover_months' => fake()->randomElement([0, 1, 2, 3, 6]),
            'hourly_rate' => fake()->randomElement([100, 125, 150, 175, 200, 250]),
            'monthly_retainer_fee' => fake()->randomElement([500, 1000, 1500, 2000, 2500, 5000]),
            'is_visible_to_client' => true,
        ];
    }

    /**
     * Indicate that the agreement is signed.
     */
    public function signed(): static
    {
        return $this->state(fn (array $attributes) => [
            'client_company_signed_date' => now(),
            'client_company_signed_user_id' => User::factory(),
            'client_company_signed_name' => fake()->name(),
            'client_company_signed_title' => fake()->jobTitle(),
        ]);
    }
}
