<?php

namespace App\Http\Requests\Toon;

use Closure;
use HelgeSverre\Toon\Exceptions\DecodeException;
use HelgeSverre\Toon\Toon;
use Illuminate\Foundation\Http\FormRequest;

class UpdateToonDocumentRequest extends FormRequest
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
            'toon_content' => [
                'required',
                'string',
                'max:5000000',
                function (string $attribute, mixed $value, Closure $fail): void {
                    try {
                        Toon::decode((string) $value);
                    } catch (DecodeException $e) {
                        $fail('The TOON content is not valid: '.$e->getMessage());
                    }
                },
            ],
        ];
    }
}
