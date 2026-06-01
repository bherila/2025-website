<?php

namespace App\Http\Requests\ClientManagement;

use App\Enums\ClientManagement\ChargeCadence;
use App\Enums\ClientManagement\ProposalItemKind;
use Illuminate\Validation\Rule;

/**
 * Partial update of a draft proposal. Reuses {@see StoreClientProposalRequest}'s
 * item-shape validation (withValidator) but makes all fields optional and drops
 * the immutable client_company_id.
 */
class UpdateClientProposalRequest extends StoreClientProposalRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'project_id' => ['nullable', 'exists:client_projects,id'],
            'title' => ['sometimes', 'string', 'max:255'],
            'body_markdown' => ['nullable', 'string'],
            'base_amount' => ['sometimes', 'numeric', 'min:0'],
            'base_description' => ['nullable', 'string', 'max:255'],
            'credit_amount' => ['nullable', 'numeric', 'min:0'],
            'credit_label' => ['nullable', 'string', 'max:255', 'required_with:credit_amount'],
            'payment_net_days' => ['sometimes', 'integer', 'min:0', 'max:365'],
            'estimated_completion_days' => ['nullable', 'integer', 'min:0', 'max:3650'],
            'retainer_amount' => ['nullable', 'numeric', 'min:0'],
            'retainer_interval_months' => ['nullable', 'integer', Rule::in([1, 3, 6, 12]), 'required_with:retainer_amount'],
            'retainer_included_hours' => ['nullable', 'numeric', 'min:0'],
            'retainer_hourly_rate' => ['nullable', 'numeric', 'min:0'],
            'retainer_description' => ['nullable', 'string', 'max:5000'],
            'items' => ['sometimes', 'array'],
            'items.*.id' => ['sometimes', 'integer'],
            'items.*.kind' => ['required', Rule::enum(ProposalItemKind::class)],
            'items.*.description' => ['required', 'string', 'max:1000'],
            'items.*.amount' => ['nullable', 'numeric', 'min:0'],
            'items.*.charge_cadence' => ['nullable', Rule::enum(ChargeCadence::class)],
            'items.*.is_optional' => ['sometimes', 'boolean'],
            'items.*.sort_order' => ['sometimes', 'integer'],
        ];
    }
}
