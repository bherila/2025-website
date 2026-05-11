<?php

namespace App\Http\Requests\Finance;

use App\Models\Files\FileForTaxDocument;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreTaxFormDocumentRequest extends FormRequest
{
    private const array VALID_MISC_ROUTINGS = ['sch_c', 'sch_e', 'sch_1_line_8', 'sch_1_8b', 'sch_1_8h', 'sch_1_8i', 'sch_1_8z'];

    /**
     * Determine if the user is authorized to make this request.
     */
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
        return self::rulesArray();
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public static function rulesArray(): array
    {
        return [
            'document_kind' => ['sometimes', 'string'],
            's3_key' => ['required', 'string'],
            'original_filename' => ['required', 'string', 'max:255'],
            'form_type' => ['required', 'string', 'in:'.implode(',', FileForTaxDocument::FORM_TYPES)],
            'tax_year' => ['required', 'integer', 'min:1900', 'max:2100'],
            'file_size_bytes' => ['required', 'integer', 'min:1'],
            'file_hash' => ['required', 'string'],
            'mime_type' => ['nullable', 'string', 'max:255'],
            'employment_entity_id' => ['nullable', 'integer'],
            'account_id' => ['nullable', 'integer'],
            'notes' => ['nullable', 'string'],
            'parsed_data' => ['nullable', 'array'],
            'skip_gen_ai_processing' => ['nullable', 'boolean'],
            'misc_routing' => ['nullable', 'string', 'in:'.implode(',', self::VALID_MISC_ROUTINGS)],
            'context_accounts' => ['nullable', 'array'],
            'context_accounts.*.name' => ['nullable', 'string', 'max:255'],
            'context_accounts.*.last4' => ['nullable', 'string', 'max:4'],
        ];
    }
}
