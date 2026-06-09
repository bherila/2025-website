<?php

namespace App\Http\Requests\FinanceTool;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TaxReturnPdfExportRequest extends FormRequest
{
    public const array SCOPES = ['form', 'return', 'selection'];

    public const array MODES = ['editable', 'print'];

    public const array FORM_IDS = ['form-1040', 'schedule-1', 'schedule-3', 'schedule-d', 'form-8949'];

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
            'formIds' => ['required_if:scope,selection', 'nullable', 'array', 'min:1'],
            'formIds.*' => ['string', Rule::in(self::FORM_IDS)],
            'includeProfilePii' => ['sometimes', 'boolean'],
            'mode' => ['required', 'string', Rule::in(self::MODES)],
            'filename' => ['nullable', 'string', 'max:255'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $scope = $this->normalizeString($this->input('scope', 'form'));
        $mode = $this->normalizeString($this->input('mode', 'editable'));
        $formId = $this->normalizeString($this->input('formId', $scope === 'form' ? 'form-1040' : null));
        $formIds = $scope === 'selection' ? $this->normalizeFormIds($this->input('formIds', [])) : null;

        $this->merge([
            'scope' => $scope === '' ? 'form' : $scope,
            'mode' => $mode === '' ? 'editable' : $mode,
            'formId' => $formId === '' ? null : $formId,
            'formIds' => $formIds,
            'includeProfilePii' => $this->boolean('includeProfilePii'),
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

        if (str_ends_with(strtolower($filename), '.pdf')) {
            return substr($filename, 0, 255);
        }

        return substr($filename, 0, 251).'.pdf';
    }

    /**
     * @return array<int, string>
     */
    private function normalizeFormIds(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $requested = [];

        foreach ($value as $formId) {
            $normalized = $this->normalizeString($formId);

            if ($normalized !== null && $normalized !== '') {
                $requested[] = $normalized;
            }
        }

        $known = array_values(array_filter(
            self::FORM_IDS,
            static fn (string $formId): bool => in_array($formId, $requested, true),
        ));

        // Preserve any unsupported ids (in canonical order, known first) so the
        // `formIds.*` Rule::in validation can reject them instead of silently
        // dropping part of the caller's selection.
        $unknown = array_values(array_diff(array_unique($requested), self::FORM_IDS));

        return array_merge($known, $unknown);
    }

    private function normalizeString(mixed $value): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }

        return strtolower(trim((string) $value));
    }
}
