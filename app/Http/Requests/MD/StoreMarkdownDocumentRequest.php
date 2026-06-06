<?php

namespace App\Http\Requests\MD;

use Illuminate\Foundation\Http\FormRequest;

class StoreMarkdownDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'title' => ['nullable', 'string', 'max:120'],
            'markdown_content' => ['required', 'string', 'max:5000000'],
        ];
    }
}
