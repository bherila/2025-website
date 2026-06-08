<?php

namespace App\Http\Requests\Finance;

use App\Models\FinanceTool\FinDocument;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class IndexDocumentsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'q' => ['nullable', 'string', 'max:255'],
            'tax_year' => ['nullable', 'integer', 'min:1900', 'max:2100'],
            'document_kind' => ['nullable', 'string'],
            'document_type' => ['nullable', 'string'],
            'account_id' => ['nullable', 'integer'],
            'form_type' => ['nullable', 'string', 'max:50'],
            'genai_status' => ['nullable', 'string', 'max:50'],
            'is_reviewed' => ['nullable', 'boolean'],
            'missing_account' => ['nullable', 'boolean'],
            'has_tax_document' => ['nullable', 'boolean'],
            'has_statement' => ['nullable', 'boolean'],
            'has_lots' => ['nullable', 'boolean'],
            'processing_status' => ['nullable', 'string', 'max:50'],
            'source_job_id' => ['nullable', 'integer'],
            'sort' => ['nullable', 'string', 'in:default,created_desc,name_asc,kind_asc,tax_year_desc,period_end_desc,document_date_desc'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ];
    }

    /**
     * Validate document_kind values after base validation.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($this->filled('document_kind')) {
                $kinds = array_filter(array_map('trim', explode(',', (string) $this->input('document_kind'))));
                foreach ($kinds as $kind) {
                    if (! in_array($kind, FinDocument::DOCUMENT_KINDS, true)) {
                        $validator->errors()->add('document_kind', "Invalid document kind: {$kind}");
                    }
                }
            }
        });
    }
}
