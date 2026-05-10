<?php

namespace Database\Factories\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyStripeCustomer;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClientCompanyStripeCustomer>
 */
class ClientCompanyStripeCustomerFactory extends Factory
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
            'stripe_customer_id' => 'cus_'.fake()->unique()->regexify('[A-Za-z0-9]{14}'),
            'created_by' => User::factory(),
        ];
    }
}
