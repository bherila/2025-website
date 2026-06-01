<?php

namespace App\Http\Requests\ClientManagement;

use Illuminate\Foundation\Http\FormRequest;

class AcceptProposalRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'title' => ['required', 'string', 'max:255'],
            'selected_item_ids' => ['sometimes', 'array'],
            'selected_item_ids.*' => ['integer'],
        ];
    }
}
