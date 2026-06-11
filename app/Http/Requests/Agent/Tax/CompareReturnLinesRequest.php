<?php

namespace App\Http\Requests\Agent\Tax;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Validates POST /api/agent/v1/tax/preview/{year}/compare-return-lines.
 *
 * The agent API is stateless (no session), so validation failures are always
 * rendered as JSON 422 — never a redirect — regardless of the Accept header
 * (the TOON negotiation middleware re-encodes the JSON when requested).
 */
class CompareReturnLinesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'return_type' => ['nullable', 'string', 'max:64'],
            'tolerance_cents' => ['nullable', 'integer', 'min:0', 'max:100000000'],
            'lines' => ['required', 'array', 'min:1', 'max:500'],
            'lines.*.form' => ['required', 'string', 'max:64'],
            'lines.*.line' => ['required', 'string', 'max:32'],
            'lines.*.label' => ['nullable', 'string', 'max:255'],
            'lines.*.amount_cents' => ['required', 'integer'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'lines.required' => 'At least one return line is required.',
            'lines.max' => 'At most 500 return lines may be compared per request.',
            'lines.*.form.required' => 'Each line needs a form, e.g. "1040" or "Schedule D".',
            'lines.*.line.required' => 'Each line needs a line identifier, e.g. "1z" or "16".',
            'lines.*.amount_cents.required' => 'Each line needs an integer amount_cents.',
            'lines.*.amount_cents.integer' => 'amount_cents must be an integer number of cents.',
        ];
    }

    protected function failedValidation(Validator $validator): void
    {
        throw new HttpResponseException(response()->json([
            'message' => 'The given data was invalid.',
            'errors' => $validator->errors()->toArray(),
        ], 422));
    }
}
