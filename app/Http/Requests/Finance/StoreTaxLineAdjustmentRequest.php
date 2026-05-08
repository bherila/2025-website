<?php

namespace App\Http\Requests\Finance;

use App\Models\FinanceTool\FinTaxLineAdjustment;
use App\Support\Finance\TaxYearRange;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreTaxLineAdjustmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'tax_year' => ['required', 'integer', 'min:'.TaxYearRange::MIN, 'max:'.TaxYearRange::MAX],
            'form' => ['required', 'string', Rule::in(FinTaxLineAdjustment::FORMS)],
            'entity_id' => ['nullable', 'integer'],
            'line_ref' => ['required', 'string', 'max:40'],
            'kind' => ['required', 'string', Rule::in(FinTaxLineAdjustment::KINDS)],
            'amount' => ['nullable', 'numeric'],
            'description' => ['nullable', 'string', 'max:5000'],
            'status' => ['sometimes', 'string', Rule::in(FinTaxLineAdjustment::STATUSES)],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (in_array($this->input('kind'), ['override', 'adjustment'], true) && $this->input('amount') === null) {
                $validator->errors()->add('amount', 'An amount is required for overrides and adjustments.');
            }
        });
    }
}
