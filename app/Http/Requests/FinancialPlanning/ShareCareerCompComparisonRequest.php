<?php

namespace App\Http\Requests\FinancialPlanning;

use Illuminate\Foundation\Http\FormRequest;

class ShareCareerCompComparisonRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return array_merge(
            ComputeCareerCompRequest::inputRules(),
            [
                'shareIncludesCurrent' => ['nullable', 'boolean'],
                'expiresAt' => ['nullable', 'date'],
            ],
        );
    }
}
