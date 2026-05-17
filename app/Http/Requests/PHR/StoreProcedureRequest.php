<?php

namespace App\Http\Requests\PHR;

use Illuminate\Foundation\Http\FormRequest;

class StoreProcedureRequest extends FormRequest
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
            'cpt_code' => ['nullable', 'string', 'max:20'],
            'snomed_code' => ['nullable', 'string', 'max:50'],
            'performed_at' => ['nullable', 'date'],
            'performed_on' => ['nullable', 'date'],
            'performer_name' => ['nullable', 'string', 'max:255'],
            'performer_specialty' => ['nullable', 'string', 'max:100'],
            'facility_name' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'string', 'max:50'],
            'reason' => ['nullable', 'string', 'max:10000'],
            'outcome' => ['nullable', 'string', 'max:10000'],
            'notes' => ['nullable', 'string', 'max:10000'],
        ];
    }
}
