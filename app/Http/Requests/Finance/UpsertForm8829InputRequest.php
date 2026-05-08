<?php

namespace App\Http\Requests\Finance;

use App\Models\FinanceTool\FinForm8829Input;
use App\Support\Finance\TaxYearRange;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpsertForm8829InputRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'entity_id' => ['required', 'integer'],
            'tax_year' => ['required', 'integer', 'min:'.TaxYearRange::MIN, 'max:'.TaxYearRange::MAX],
            'method' => ['required', 'string', Rule::in(FinForm8829Input::METHODS)],
            'office_sqft' => ['nullable', 'numeric', 'min:0'],
            'home_sqft' => ['nullable', 'numeric', 'min:0'],
            'months_used' => ['required', 'integer', 'min:1', 'max:12'],
            'prior_year_op_carryover' => ['nullable', 'numeric', 'min:0'],
            'prior_year_op_carryover_ca' => ['nullable', 'numeric', 'min:0'],
            'prior_year_depreciation_carryover' => ['nullable', 'numeric', 'min:0'],
            'prior_year_depreciation_carryover_ca' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }
}
