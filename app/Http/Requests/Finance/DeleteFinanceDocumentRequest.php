<?php

namespace App\Http\Requests\Finance;

use Illuminate\Foundation\Http\FormRequest;

class DeleteFinanceDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array{confirm: list<string>, file_hash: list<string>}
     */
    public function rules(): array
    {
        return [
            'confirm' => ['sometimes', 'boolean'],
            'file_hash' => ['nullable', 'string', 'max:128'],
        ];
    }
}
