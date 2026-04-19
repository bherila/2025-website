<?php

namespace App\Http\Requests\Finance;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class DeleteUserTaxStateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    protected function prepareForValidation(): void
    {
        $stateCode = $this->route('stateCode');

        if (is_string($stateCode)) {
            $this->merge([
                'state_code' => strtoupper(trim($stateCode)),
            ]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'year' => ['required', 'integer', 'min:2018', 'max:2030'],
            'state_code' => ['required', 'string', 'regex:/^[A-Z]{2}$/', Rule::in(['CA', 'NY'])],
        ];
    }
}
