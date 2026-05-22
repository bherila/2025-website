<?php

namespace Database\Factories;

use App\Models\ClassActionClaim;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClassActionClaim>
 */
class ClassActionClaimFactory extends Factory
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
            'name' => fake()->company().' Settlement',
            'claim_id' => fake()->optional()->bothify('??##??##'),
            'pin' => fake()->optional()->bothify('??##??'),
            'notification_received_on' => fake()->dateTimeBetween('-8 months', 'now')->format('Y-m-d'),
            'notification_email_copy' => fake()->optional()->paragraphs(2, true),
            'class_action_url' => fake()->optional()->url(),
            'payment_election_submitted_on' => fake()->optional()->dateTimeBetween('-6 months', 'now')?->format('Y-m-d'),
            'claim_submitted_on' => fake()->optional()->dateTimeBetween('-6 months', 'now')?->format('Y-m-d'),
            'claim_deadline' => fake()->optional()->dateTimeBetween('now', '+8 months')?->format('Y-m-d'),
            'administrator' => fake()->optional()->company(),
            'defendant' => fake()->optional()->company(),
            'final_approval_hearing_on' => fake()->optional()->dateTimeBetween('now', '+12 months')?->format('Y-m-d'),
            'expected_payment_amount' => fake()->optional()->randomFloat(2, 1, 500),
            'expected_payment_on' => fake()->optional()->dateTimeBetween('now', '+12 months')?->format('Y-m-d'),
            'actual_payment_amount' => null,
            'payment_received' => false,
            'payment_received_on' => null,
            'payment_fin_transaction_id' => null,
            'notes' => fake()->optional()->sentence(),
        ];
    }

    public function paymentReceived(): static
    {
        return $this->state(fn (): array => [
            'payment_received' => true,
            'payment_received_on' => fake()->dateTimeBetween('-2 months', 'now')->format('Y-m-d'),
            'actual_payment_amount' => fake()->randomFloat(2, 1, 500),
        ]);
    }
}
