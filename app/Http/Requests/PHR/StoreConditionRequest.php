<?php

namespace App\Http\Requests\PHR;

use Illuminate\Foundation\Http\FormRequest;

class StoreConditionRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return auth()->check();
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => [$this->isMethod('PATCH') ? 'sometimes' : 'required', 'string', 'max:255'],
            'icd10_code' => ['nullable', 'string', 'max:20'],
            'snomed_code' => ['nullable', 'string', 'max:50'],
            'onset_date' => ['nullable', 'date'],
            'abated_date' => ['nullable', 'date'],
            'clinical_status' => ['nullable', 'string', 'max:50'],
            'verification_status' => ['nullable', 'string', 'max:50'],
            'severity' => ['nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string', 'max:10000'],
        ];
    }
}
