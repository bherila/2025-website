<?php

namespace App\Http\Requests\Agent;

use Illuminate\Foundation\Http\FormRequest;

class CreateSetupTokenRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'module' => ['required', 'string', 'in:finance,career-comparison,tax'],
            'client' => ['nullable', 'string', 'in:claude,codex,generic'],
            'ttl_minutes' => ['nullable', 'integer', 'min:5', 'max:1440'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'module.required' => 'A module is required (finance, career-comparison, or tax).',
            'module.in' => 'Unknown module. Valid modules: finance, career-comparison, tax.',
            'client.in' => 'Unknown client hint. Valid clients: claude, codex, generic.',
            'ttl_minutes.min' => 'Token lifetime must be at least 5 minutes.',
            'ttl_minutes.max' => 'Token lifetime may not exceed 1440 minutes (24 hours).',
        ];
    }
}
