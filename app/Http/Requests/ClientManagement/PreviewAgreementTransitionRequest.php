<?php

namespace App\Http\Requests\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\FirstCycleProration;
use App\Models\ClientManagement\ClientAgreement;
use Carbon\Carbon;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class PreviewAgreementTransitionRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return auth()->check();
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'effective_date' => ['required', 'date'],
            'billing_cadence' => ['sometimes', Rule::enum(BillingCadence::class)],
            'monthly_retainer_hours' => ['sometimes', 'numeric', 'min:0'],
            'catch_up_threshold_hours' => ['sometimes', 'numeric', 'min:0'],
            'rollover_months' => ['sometimes', 'integer', 'min:0'],
            'hourly_rate' => ['sometimes', 'numeric', 'min:0'],
            'monthly_retainer_fee' => ['sometimes', 'numeric', 'min:0'],
            'retainer_fee' => ['sometimes', 'numeric', 'min:0'],
            'retainer_hours' => ['sometimes', 'numeric', 'min:0'],
            'bill_overage_interim' => ['sometimes', 'boolean'],
            'first_cycle_proration' => ['sometimes', Rule::enum(FirstCycleProration::class)],
            'successor_terms' => ['sometimes', 'array'],
            'successor_terms.billing_cadence' => ['sometimes', Rule::enum(BillingCadence::class)],
            'successor_terms.monthly_retainer_hours' => ['sometimes', 'numeric', 'min:0'],
            'successor_terms.catch_up_threshold_hours' => ['sometimes', 'numeric', 'min:0'],
            'successor_terms.rollover_months' => ['sometimes', 'integer', 'min:0'],
            'successor_terms.hourly_rate' => ['sometimes', 'numeric', 'min:0'],
            'successor_terms.monthly_retainer_fee' => ['sometimes', 'numeric', 'min:0'],
            'successor_terms.retainer_fee' => ['sometimes', 'numeric', 'min:0'],
            'successor_terms.retainer_hours' => ['sometimes', 'numeric', 'min:0'],
            'successor_terms.bill_overage_interim' => ['sometimes', 'boolean'],
            'successor_terms.first_cycle_proration' => ['sometimes', Rule::enum(FirstCycleProration::class)],
            'carry_rollover' => ['sometimes', 'boolean'],
            'recurring_item_handling' => ['sometimes', Rule::in(['clone', 'migrate', 'drop', 'end', 'skip'])],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty() || ! $this->filled('effective_date')) {
                return;
            }

            $agreement = $this->agreement();
            if (! $agreement) {
                return;
            }

            $effectiveDate = Carbon::parse($this->input('effective_date'))->startOfDay();
            if ($effectiveDate->lte($agreement->active_date->copy()->startOfDay())) {
                $validator->errors()->add('effective_date', 'Effective date must be after the current agreement active date.');
            }

            if ($agreement->termination_date && $effectiveDate->gt($agreement->termination_date->copy()->startOfDay())) {
                $validator->errors()->add('effective_date', 'Effective date must be on or before the current agreement termination date.');
            }
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return $this->validated();
    }

    private function agreement(): ?ClientAgreement
    {
        $agreement = $this->route('agreement');

        return $agreement instanceof ClientAgreement ? $agreement : null;
    }
}
