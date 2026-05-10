<?php

namespace Database\Factories\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceStripePayment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClientInvoiceStripePayment>
 */
class ClientInvoiceStripePaymentFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'client_invoice_id' => function (): int {
                $company = ClientCompany::factory()->create();

                return (int) ClientInvoice::create([
                    'client_company_id' => $company->id,
                    'period_start' => now()->startOfMonth(),
                    'period_end' => now()->endOfMonth(),
                    'invoice_number' => 'INV-'.fake()->unique()->numberBetween(1000, 9999),
                    'invoice_total' => 250.00,
                    'status' => 'issued',
                    'issue_date' => now(),
                ])->client_invoice_id;
            },
            'stripe_payment_intent_id' => 'pi_'.fake()->unique()->regexify('[A-Za-z0-9]{24}'),
            'stripe_customer_id' => 'cus_'.fake()->regexify('[A-Za-z0-9]{14}'),
            'stripe_payment_method_id' => 'pm_'.fake()->regexify('[A-Za-z0-9]{24}'),
            'amount' => fake()->numberBetween(1000, 100000),
            'status' => 'processing',
            'failure_reason' => null,
            'last_event_id' => null,
        ];
    }
}
