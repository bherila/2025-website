<?php

namespace App\Http\Requests\Finance;

use App\Support\Finance\TaxYearRange;
use Illuminate\Foundation\Http\FormRequest;

class StorePalCarryforwardRequest extends FormRequest
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
            'activity_name' => ['required', 'string', 'max:255'],
            'activity_ein' => ['nullable', 'string', 'max:20'],
            'ordinary_carryover' => ['required', 'numeric'],
            'short_term_carryover' => ['sometimes', 'numeric'],
            'long_term_carryover' => ['sometimes', 'numeric'],
        ];
    }
}
