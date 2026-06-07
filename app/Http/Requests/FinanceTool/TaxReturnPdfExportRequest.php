<?php

namespace App\Http\Requests\FinanceTool;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TaxReturnPdfExportRequest extends FormRequest
{
    public const array SCOPES = ['form', 'return'];

    public const array MODES = ['editable', 'print'];

    public const array FORM_IDS = ['form-1040'];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'year' => ['required', 'integer', 'min:1900', 'max:2100'],
            'scope' => ['required', 'string', Rule::in(self::SCOPES)],
            'formId' => ['required_if:scope,form', 'nullable', 'string', Rule::in(self::FORM_IDS)],
            'mode' => ['required', 'string', Rule::in(self::MODES)],
            'filename' => ['nullable', 'string', 'max:255'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $scope = $this->normalizeString($this->input('scope', 'form'));
        $mode = $this->normalizeString($this->input('mode', 'editable'));
        $formId = $this->normalizeString($this->input('formId', $scope === 'form' ? 'form-1040' : null));

        $this->merge([
            'scope' => $scope === '' ? 'form' : $scope,
            'mode' => $mode === '' ? 'editable' : $mode,
            'formId' => $formId === '' ? null : $formId,
        ]);
    }

    public function sanitizedFilename(): string
    {
        $validated = $this->validated();
        $year = (int) $validated['year'];
        $scope = (string) $validated['scope'];
        $formId = (string) ($validated['formId'] ?? 'federal-return');
        $filename = isset($validated['filename']) && is_scalar($validated['filename'])
            ? trim((string) $validated['filename'])
            : '';

        if ($filename === '') {
            $filename = $scope === 'form' ? "{$year}-{$formId}.pdf" : "{$year}-federal-return.pdf";
        }

        $filename = preg_replace('/[^A-Za-z0-9._-]/', '-', $filename) ?: "{$year}-tax-return.pdf";

        return str_ends_with(strtolower($filename), '.pdf') ? $filename : "{$filename}.pdf";
    }

    private function normalizeString(mixed $value): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }

        return strtolower(trim((string) $value));
    }
}
