<?php

namespace Database\Factories\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyPaymentMethod;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClientCompanyPaymentMethod>
 */
class ClientCompanyPaymentMethodFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'client_company_id' => ClientCompany::factory(),
            'stripe_payment_method_id' => 'pm_'.fake()->unique()->regexify('[A-Za-z0-9]{24}'),
            'type' => 'card',
            'brand' => fake()->randomElement(['visa', 'mastercard', 'amex']),
            'last4' => fake()->numerify('####'),
            'exp_month' => fake()->numberBetween(1, 12),
            'exp_year' => fake()->numberBetween((int) date('Y'), (int) date('Y') + 6),
            'bank_name' => null,
            'is_default' => false,
        ];
    }
}
