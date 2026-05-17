<?php

namespace App\Http\Requests\PHR\DICOM;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreDicomUploadRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return auth()->check();
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'root_name' => ['nullable', 'string', 'max:255'],
            'files' => ['required', 'array', 'min:1', 'max:500'],
            'files.*' => ['required', 'file', 'max:51200'],
            'relative_paths' => ['nullable', 'array'],
            'relative_paths.*' => ['nullable', 'string', 'max:1024'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'files.required' => 'Select at least one DICOM file or DICOM directory.',
            'files.max' => 'A single upload may contain at most 500 files; split large studies across multiple uploads.',
            'files.*.max' => 'Each DICOM file must be 50 MB or smaller.',
        ];
    }
}
