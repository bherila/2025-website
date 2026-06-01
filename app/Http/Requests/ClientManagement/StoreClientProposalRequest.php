<?php

namespace App\Http\Requests\ClientManagement;

use App\Enums\ClientManagement\ChargeCadence;
use App\Enums\ClientManagement\ProposalItemKind;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreClientProposalRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'client_company_id' => ['required', 'exists:client_companies,id'],
            'project_id' => [
                'nullable',
                Rule::exists('client_projects', 'id')->where(
                    fn ($query) => $query->where('client_company_id', $this->input('client_company_id')),
                ),
            ],
            'title' => ['required', 'string', 'max:255'],
            'body_markdown' => ['nullable', 'string'],
            'base_amount' => ['required', 'numeric', 'min:0'],
            'base_description' => ['nullable', 'string', 'max:255'],
            'credit_amount' => ['nullable', 'numeric', 'min:0'],
            'credit_label' => ['nullable', 'string', 'max:255', 'required_with:credit_amount'],
            'payment_net_days' => ['required', 'integer', 'min:0', 'max:365'],
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

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            foreach ((array) $this->input('items', []) as $index => $item) {
                $kind = $item['kind'] ?? null;
                $amount = $item['amount'] ?? null;

                if ($kind === ProposalItemKind::AddOn->value && ($amount === null || $amount === '')) {
                    $validator->errors()->add("items.{$index}.amount", 'Add-on items require an amount.');
                }

                if ($kind === ProposalItemKind::Scope->value && $amount !== null && $amount !== '') {
                    $validator->errors()->add("items.{$index}.amount", 'Scope items must not have an amount.');
                }
            }
        });
    }
}
