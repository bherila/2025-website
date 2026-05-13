<?php

namespace App\Http\Requests\FinancialPlanning;

use Illuminate\Foundation\Http\FormRequest;

class StoreRothConversionScenarioRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return array_merge([
            'title' => ['nullable', 'string', 'max:120'],
        ], ComputeRothConversionRequest::scenarioRules($this->input('inputs.filingStatus'), $this->input('inputs.currentYear')));
    }
}
