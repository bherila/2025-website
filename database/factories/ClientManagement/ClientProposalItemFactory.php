<?php

namespace Database\Factories\ClientManagement;

use App\Enums\ClientManagement\ChargeCadence;
use App\Enums\ClientManagement\ProposalItemKind;
use App\Models\ClientManagement\ClientProposal;
use App\Models\ClientManagement\ClientProposalItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClientProposalItem>
 */
class ClientProposalItemFactory extends Factory
{
    protected $model = ClientProposalItem::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'client_proposal_id' => ClientProposal::factory(),
            'kind' => ProposalItemKind::AddOn,
            'description' => fake()->sentence(4),
            'amount' => fake()->randomElement([250, 375, 500, 750]),
            'charge_cadence' => ChargeCadence::OneTime,
            'is_optional' => false,
            'is_selected' => false,
            'sort_order' => 0,
        ];
    }

    /**
     * An unpriced scope/deliverable item (becomes a task on acceptance).
     */
    public function scope(): static
    {
        return $this->state(fn (array $attributes) => [
            'kind' => ProposalItemKind::Scope,
            'amount' => null,
            'charge_cadence' => ChargeCadence::OneTime,
        ]);
    }

    /**
     * A priced add-on item.
     */
    public function addOn(float $amount = 375, ChargeCadence $cadence = ChargeCadence::OneTime): static
    {
        return $this->state(fn (array $attributes) => [
            'kind' => ProposalItemKind::AddOn,
            'amount' => $amount,
            'charge_cadence' => $cadence,
        ]);
    }

    /**
     * Mark the item as optional (client-selectable at accept).
     */
    public function optional(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_optional' => true,
        ]);
    }
}
