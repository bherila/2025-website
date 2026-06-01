<?php

namespace Database\Factories\ClientManagement;

use App\Enums\ClientManagement\ProposalStatus;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProposal;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClientProposal>
 */
class ClientProposalFactory extends Factory
{
    protected $model = ClientProposal::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'client_company_id' => ClientCompany::factory(),
            'version' => 1,
            'status' => ProposalStatus::Draft,
            'is_visible_to_client' => false,
            'title' => fake()->sentence(4),
            'body_markdown' => fake()->paragraphs(2, true),
            'base_amount' => fake()->randomElement([1000, 2000, 3500, 5000]),
            'base_description' => 'Cost for the above',
            'credit_amount' => null,
            'credit_label' => null,
            'payment_net_days' => 30,
            'estimated_completion_days' => fake()->randomElement([10, 14, 30]),
            'retainer_amount' => null,
            'retainer_interval_months' => null,
            'retainer_included_hours' => null,
            'retainer_hourly_rate' => null,
            'retainer_description' => null,
        ];
    }

    /**
     * Indicate that the proposal has been sent to the client.
     */
    public function sent(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => ProposalStatus::Sent,
            'is_visible_to_client' => true,
            'sent_at' => now(),
        ]);
    }

    /**
     * Attach a retainer billed every $intervalMonths months.
     */
    public function withRetainer(float $amount = 275, int $intervalMonths = 6, float $includedHours = 1, float $hourlyRate = 150): static
    {
        return $this->state(fn (array $attributes) => [
            'retainer_amount' => $amount,
            'retainer_interval_months' => $intervalMonths,
            'retainer_included_hours' => $includedHours,
            'retainer_hourly_rate' => $hourlyRate,
            'retainer_description' => 'Webhosting, security updates, and monitoring included.',
        ]);
    }

    /**
     * Record this proposal as the successor of another version.
     */
    public function revisionOf(ClientProposal $previous): static
    {
        return $this->state(fn (array $attributes) => [
            'client_company_id' => $previous->client_company_id,
            'root_id' => $previous->root_id ?? $previous->id,
            'version' => $previous->version + 1,
            'previous_version_id' => $previous->id,
        ]);
    }

    /**
     * Mark the proposal as accepted by a user.
     */
    public function accepted(?User $user = null): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => ProposalStatus::Accepted,
            'is_visible_to_client' => true,
            'sent_at' => now()->subDay(),
            'accepted_at' => now(),
            'accepted_by_user_id' => $user?->id ?? User::factory(),
            'accept_signature_name' => fake()->name(),
            'accept_signature_title' => fake()->jobTitle(),
        ]);
    }
}
