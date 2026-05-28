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
     * @return array{confirm: list<string>, confirmation_token: list<string>}
     */
    public function rules(): array
    {
        return [
            'confirm' => ['sometimes', 'boolean'],
            'confirmation_token' => ['nullable', 'string', 'max:128'],
        ];
    }
}
