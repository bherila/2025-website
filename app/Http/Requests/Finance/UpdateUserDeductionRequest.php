<?php

namespace App\Http\Requests\Finance;

use App\Enums\Finance\DeductionCategory;
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
            'category' => ['sometimes', 'string', Rule::in(DeductionCategory::values())],
            'description' => ['nullable', 'string', 'max:255'],
            'amount' => ['sometimes', 'numeric', 'min:0.01'],
            // tax_year is immutable after creation — silently ignored if sent
        ];
    }
}
