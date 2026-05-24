<?php

namespace App\Http\Requests\FinanceTool;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ConfirmRsuGenAiImportRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'award_id' => ['required', 'string', 'max:20'],
            'grant_date' => ['required', 'date_format:Y-m-d'],
            'vest_date' => ['required', 'date_format:Y-m-d'],
            'share_count' => ['required', 'integer', 'min:0'],
            'symbol' => ['required', 'string', 'max:4', 'regex:/^[A-Z0-9.]+$/'],
            'grant_price' => ['nullable', 'numeric', 'min:0'],
            'vest_price' => ['nullable', 'numeric', 'min:0'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $symbol = $this->input('symbol');
        if (is_string($symbol)) {
            $this->merge(['symbol' => strtoupper(trim($symbol))]);
        }
    }
}
