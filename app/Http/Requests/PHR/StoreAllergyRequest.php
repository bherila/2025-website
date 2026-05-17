<?php

namespace App\Http\Requests\PHR;

use Illuminate\Foundation\Http\FormRequest;

class StoreAllergyRequest extends FormRequest
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
            'substance' => [$this->isMethod('PATCH') ? 'sometimes' : 'required', 'string', 'max:255'],
            'rxnorm_code' => ['nullable', 'string', 'max:50'],
            'snomed_code' => ['nullable', 'string', 'max:50'],
            'category' => ['nullable', 'string', 'max:50'],
            'criticality' => ['nullable', 'string', 'max:50'],
            'clinical_status' => ['nullable', 'string', 'max:50'],
            'verification_status' => ['nullable', 'string', 'max:50'],
            'reaction' => ['nullable', 'string', 'max:255'],
            'severity' => ['nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string', 'max:10000'],
        ];
    }
}
