<?php

namespace App\Http\Requests\Finance;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreUserDeductionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'tax_year' => ['required', 'integer', 'min:2018', 'max:2030'],
            'category' => ['required', 'string', Rule::in([
                'real_estate_tax', 'state_est_tax', 'sales_tax',
                'mortgage_interest', 'charitable_cash', 'charitable_noncash', 'other',
            ])],
            'description' => ['nullable', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0.01'],
        ];
    }
}
