<?php

namespace App\Http\Requests\Finance;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreUserTaxStateRequest extends FormRequest
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
            // Accept lowercase input — normalized to uppercase in the controller.
            // Whitelist to states that have bracket data in taxBracket.ts.
            'state_code' => ['required', 'string', 'regex:/^[A-Za-z]{2}$/', Rule::in(['CA', 'NY', 'ca', 'ny'])],
        ];
    }
}
