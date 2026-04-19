<?php

namespace App\Http\Requests\Finance;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUserDeductionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'category' => ['sometimes', 'string', Rule::in([
                'real_estate_tax', 'state_est_tax', 'sales_tax',
                'mortgage_interest', 'charitable_cash', 'charitable_noncash', 'other',
            ])],
            'description' => ['nullable', 'string', 'max:255'],
            'amount' => ['sometimes', 'numeric', 'min:0.01'],
            // tax_year is immutable after creation — silently ignored if sent
        ];
    }
}
