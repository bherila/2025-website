<?php

namespace App\Http\Requests\FinancialPlanning;

use Illuminate\Foundation\Http\FormRequest;

class UpdateOpportunityCostComparisonRequest extends FormRequest
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
        return array_merge(
            ComputeOpportunityCostRequest::inputRules(),
            ['shareIncludesCurrent' => ['nullable', 'boolean']],
        );
    }
}
