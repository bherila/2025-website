<?php

namespace App\Http\Requests\Finance;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class BulkUpdateDocumentAccountsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'links' => ['required', 'array', 'min:1', 'max:100'],
            'links.*.link_id' => ['required', 'integer', 'min:1', 'distinct'],
            'links.*.account_id' => ['nullable', 'integer', 'min:1'],
            'links.*.is_reviewed' => ['sometimes', 'boolean'],
        ];
    }
}
