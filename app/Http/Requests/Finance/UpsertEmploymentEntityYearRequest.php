<?php

namespace App\Http\Requests\Finance;

use App\Models\FinanceTool\FinEmploymentEntityYear;
use App\Support\Finance\TaxYearRange;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpsertEmploymentEntityYearRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $taxYearPresence = $this->route('year') === null ? 'required' : 'sometimes';

        return [
            'tax_year' => [$taxYearPresence, 'integer', 'min:'.TaxYearRange::MIN, 'max:'.TaxYearRange::MAX],
            'accounting_method' => ['sometimes', 'string', Rule::in(FinEmploymentEntityYear::ACCOUNTING_METHODS)],
            'materially_participated' => ['sometimes', 'boolean'],
            'made_payments_requiring_1099' => ['sometimes', 'boolean'],
            'filed_required_1099s' => ['nullable', 'boolean'],
            'started_or_acquired_this_year' => ['sometimes', 'boolean'],
            'principal_product_service' => ['nullable', 'string', 'max:1000'],
            'business_code' => ['nullable', 'string', 'size:6', 'regex:/^[0-9]{6}$/'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'business_code.regex' => 'The business code must be a six-digit IRS business activity code.',
        ];
    }
}
