<?php

namespace App\Http\Requests\ClientManagement;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class UpdateClientCompanyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('Admin');
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'company_name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string'],
            'website' => ['nullable', 'url'],
            'phone_number' => ['nullable', 'string', 'max:255'],
            'default_hourly_rate' => ['nullable', 'numeric', 'min:0'],
            'additional_notes' => ['nullable', 'string'],
            'is_active' => ['required', 'boolean'],
            'stripe_billing_enabled' => ['sometimes', 'boolean'],
        ];
    }
}
