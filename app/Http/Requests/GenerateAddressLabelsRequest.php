<?php

namespace App\Http\Requests;

use App\Support\AveryLabelSpec;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class GenerateAddressLabelsRequest extends FormRequest
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
            'sheet_number' => ['required', 'string', Rule::in(array_keys(AveryLabelSpec::options()))],
            'addresses' => ['required', 'string'],
            'parser_mode' => ['nullable', 'string', Rule::in(['auto', 'delimited', 'blocks'])],
            'font_size' => ['nullable', 'numeric', 'min:7', 'max:14'],
            'vertical_align' => ['nullable', 'string', Rule::in(['top', 'center'])],
            'bold_first_line' => ['nullable', 'boolean'],
            'skip_count' => ['nullable', 'integer', 'min:0', 'max:500'],
            'copies' => ['nullable', 'integer', 'min:1', 'max:500'],
            'download' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'sheet_number.in' => 'Choose a supported Avery sheet number.',
            'addresses.required' => 'Paste at least one address row.',
        ];
    }

    public function sheetNumber(): string
    {
        return $this->string('sheet_number')->toString();
    }

    public function parserMode(): string
    {
        return $this->string('parser_mode', 'auto')->toString();
    }

    public function addresses(): string
    {
        return $this->string('addresses')->toString();
    }

    public function fontSize(): float
    {
        return (float) $this->input('font_size', 11);
    }

    public function isVerticallyCentered(): bool
    {
        return $this->string('vertical_align', 'top')->toString() === 'center';
    }

    public function shouldBoldFirstLine(): bool
    {
        return $this->boolean('bold_first_line');
    }

    public function skipCount(int $labelsPerPage): int
    {
        return min($this->integer('skip_count', 0), max(0, $labelsPerPage - 1));
    }

    public function copies(): int
    {
        return $this->integer('copies', 1);
    }

    public function shouldDownload(): bool
    {
        return $this->boolean('download');
    }
}
