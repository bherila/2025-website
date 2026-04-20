<?php

namespace App\Http\Requests\Finance;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePalCarryforwardRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'activity_name' => ['sometimes', 'string', 'max:255'],
            'activity_ein' => ['nullable', 'string', 'max:20'],
            'ordinary_carryover' => ['sometimes', 'numeric'],
            'short_term_carryover' => ['sometimes', 'numeric'],
            'long_term_carryover' => ['sometimes', 'numeric'],
            // tax_year is immutable after creation — silently ignored if sent
        ];
    }
}
