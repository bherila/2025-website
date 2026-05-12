<?php

namespace App\Http\Requests;

use App\Support\AveryLabelSpec;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AddressLabelCalibrationRequest extends FormRequest
{
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
            'sheet_number' => ['nullable', 'string', Rule::in(array_keys(AveryLabelSpec::options()))],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'sheet_number.in' => 'Choose a supported Avery sheet number.',
        ];
    }

    public function sheetNumber(): string
    {
        $sheetNumber = $this->string('sheet_number')->toString();

        return $sheetNumber === '' ? '48163' : $sheetNumber;
    }
}
