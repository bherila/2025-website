<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class AcknowledgeTaxNormalizationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('admin');
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'type' => ['required', Rule::in(['document', 'link'])],
            'document_id' => ['required_if:type,document', 'nullable', 'integer', 'min:1'],
            'link_id' => ['required_if:type,link', 'nullable', 'integer', 'min:1'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'type.in' => 'The type must be either document or link.',
            'document_id.required_if' => 'A document ID is required when acknowledging a document.',
            'link_id.required_if' => 'A link ID is required when acknowledging an account link.',
        ];
    }
}
