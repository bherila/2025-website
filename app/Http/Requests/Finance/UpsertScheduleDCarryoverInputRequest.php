<?php

namespace App\Http\Requests\Finance;

use App\Support\Finance\TaxYearRange;
use Illuminate\Foundation\Http\FormRequest;

class UpsertScheduleDCarryoverInputRequest extends FormRequest
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
            'short_term_loss_carryover' => ['nullable', 'numeric', 'min:0'],
            'long_term_loss_carryover' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }
}
