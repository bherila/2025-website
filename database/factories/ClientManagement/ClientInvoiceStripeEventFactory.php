<?php

namespace Database\Factories\ClientManagement;

use App\Models\ClientManagement\ClientInvoiceStripeEvent;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClientInvoiceStripeEvent>
 */
class ClientInvoiceStripeEventFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'stripe_event_id' => 'evt_'.fake()->unique()->regexify('[A-Za-z0-9]{24}'),
            'type' => fake()->randomElement(['payment_intent.succeeded', 'payment_intent.processing']),
            'payload' => [],
            'processed_at' => now(),
            'error' => null,
        ];
    }
}
