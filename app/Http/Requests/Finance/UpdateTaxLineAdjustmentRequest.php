<?php

namespace App\Http\Requests\Finance;

use App\Models\FinanceTool\FinTaxLineAdjustment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateTaxLineAdjustmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'line_ref' => ['sometimes', 'string', 'max:40'],
            'kind' => ['sometimes', 'string', Rule::in(FinTaxLineAdjustment::KINDS)],
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
