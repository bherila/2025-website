<?php

namespace App\Http\Requests\ClientManagement;

use App\Enums\ClientManagement\ChargeCadence;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientAgreementRecurringItem;
use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreClientAgreementRecurringItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'description' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'charge_cadence' => ['required', Rule::enum(ChargeCadence::class)],
            'anchor_month' => ['nullable', 'integer', 'between:1,12'],
            'anchor_day' => ['nullable', 'integer', 'between:1,28'],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'is_taxable' => ['sometimes', 'boolean'],
            'is_summarized' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'amount.gt' => 'Recurring item amount must be greater than zero.',
            'anchor_day.between' => 'Anchor day must be between 1 and 28.',
            'anchor_month.between' => 'Anchor month must be between 1 and 12.',
            'end_date.after_or_equal' => 'End date must be on or after the start date.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $agreement = $this->agreement();
            if (! $agreement) {
                return;
            }

            $this->validateAnchorMonth($validator);
            $this->validateAgreementWindow($validator, $agreement);
            $this->validateDuplicate($validator, $agreement);
        });
    }

    private function agreement(): ?ClientAgreement
    {
        $agreement = $this->route('agreement');

        return $agreement instanceof ClientAgreement ? $agreement : null;
    }

    private function validateAnchorMonth(Validator $validator): void
    {
        if (in_array($this->input('charge_cadence'), [
            ChargeCadence::Quarterly->value,
            ChargeCadence::SemiAnnual->value,
            ChargeCadence::Annual->value,
        ], true) && $this->input('anchor_month') === null) {
            $validator->errors()->add('anchor_month', 'Anchor month is required for quarterly, semi-annual, and annual recurring items.');
        }
    }

    private function validateAgreementWindow(Validator $validator, ClientAgreement $agreement): void
    {
        if ($this->filled('start_date') && Carbon::parse($this->input('start_date'))->lt($agreement->active_date->copy()->startOfDay())) {
            $validator->errors()->add('start_date', 'Start date must be on or after the agreement active date.');
        }

        if ($agreement->termination_date && $this->filled('end_date')
            && Carbon::parse($this->input('end_date'))->gt($agreement->termination_date->copy()->startOfDay())) {
            $validator->errors()->add('end_date', 'End date must be on or before the agreement termination date.');
        }
    }

    private function validateDuplicate(Validator $validator, ClientAgreement $agreement): void
    {
        if (! $this->filled(['description', 'charge_cadence', 'start_date'])) {
            return;
        }

        $query = ClientAgreementRecurringItem::query()
            ->where('client_agreement_id', $agreement->id)
            ->where('description', (string) $this->input('description'))
            ->where('charge_cadence', $this->input('charge_cadence'))
            ->whereDate('start_date', Carbon::parse($this->input('start_date'))->toDateString());

        $anchorMonth = $this->input('anchor_month');
        if ($anchorMonth === null) {
            $query->whereNull('anchor_month');
        } else {
            $query->where('anchor_month', (int) $anchorMonth);
        }

        if ($query->exists()) {
            $validator->errors()->add('description', 'A recurring item with this description, cadence, anchor month, and start date already exists.');
        }
    }
}
