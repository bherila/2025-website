<?php

namespace App\Http\Requests\ClientManagement;

use App\Enums\ClientManagement\ChargeCadence;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientAgreementRecurringItem;
use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateClientAgreementRecurringItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('Admin');
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'description' => ['sometimes', 'string', 'max:255'],
            'amount' => ['sometimes', 'numeric', 'gt:0'],
            'charge_cadence' => ['sometimes', Rule::enum(ChargeCadence::class)],
            'anchor_month' => ['nullable', 'integer', 'between:1,12'],
            'anchor_day' => ['nullable', 'integer', 'between:1,28'],
            'start_date' => ['sometimes', 'date'],
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
            $item = $this->recurringItem();
            if (! $agreement || ! $item) {
                return;
            }

            $this->validateAnchorMonth($validator, $item);
            $this->validateAgreementWindow($validator, $agreement, $item);
            $this->validateDuplicate($validator, $agreement, $item);
        });
    }

    private function agreement(): ?ClientAgreement
    {
        $agreement = $this->route('agreement');

        return $agreement instanceof ClientAgreement ? $agreement : null;
    }

    private function recurringItem(): ?ClientAgreementRecurringItem
    {
        $item = $this->route('recurringItem');

        return $item instanceof ClientAgreementRecurringItem ? $item : null;
    }

    private function validateAnchorMonth(Validator $validator, ClientAgreementRecurringItem $item): void
    {
        $chargeCadence = (string) $this->input('charge_cadence', $item->charge_cadence->value);
        $anchorMonth = $this->has('anchor_month') ? $this->input('anchor_month') : $item->anchor_month;

        if (in_array($chargeCadence, [
            ChargeCadence::Quarterly->value,
            ChargeCadence::SemiAnnual->value,
            ChargeCadence::Annual->value,
        ], true) && $anchorMonth === null) {
            $validator->errors()->add('anchor_month', 'Anchor month is required for quarterly, semi-annual, and annual recurring items.');
        }
    }

    private function validateAgreementWindow(
        Validator $validator,
        ClientAgreement $agreement,
        ClientAgreementRecurringItem $item,
    ): void {
        $startDate = $this->has('start_date') ? Carbon::parse($this->input('start_date')) : $item->start_date;
        $endDate = $this->has('end_date') && $this->input('end_date') !== null
            ? Carbon::parse($this->input('end_date'))
            : ($this->has('end_date') ? null : $item->end_date);

        if ($startDate->lt($agreement->active_date->copy()->startOfDay())) {
            $validator->errors()->add('start_date', 'Start date must be on or after the agreement active date.');
        }

        if ($agreement->termination_date && $endDate && $endDate->gt($agreement->termination_date->copy()->startOfDay())) {
            $validator->errors()->add('end_date', 'End date must be on or before the agreement termination date.');
        }
    }

    private function validateDuplicate(
        Validator $validator,
        ClientAgreement $agreement,
        ClientAgreementRecurringItem $item,
    ): void {
        $description = (string) $this->input('description', $item->description);
        $chargeCadence = (string) $this->input('charge_cadence', $item->charge_cadence->value);
        $startDate = $this->has('start_date') ? Carbon::parse($this->input('start_date')) : $item->start_date;
        $anchorMonth = $this->has('anchor_month') ? $this->input('anchor_month') : $item->anchor_month;

        $query = ClientAgreementRecurringItem::query()
            ->where('client_agreement_id', $agreement->id)
            ->where('id', '!=', $item->id)
            ->where('description', $description)
            ->where('charge_cadence', $chargeCadence)
            ->whereDate('start_date', $startDate->toDateString());

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
