<?php

namespace App\Http\Requests\Finance;

use App\Enums\Finance\DeductionCategory;
use App\Support\Finance\TaxYearRange;
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
            'tax_year' => ['required', 'integer', 'min:'.TaxYearRange::MIN, 'max:'.TaxYearRange::MAX],
            'category' => ['required', 'string', Rule::in(DeductionCategory::values())],
            'description' => ['nullable', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0.01'],
        ];
    }
}
