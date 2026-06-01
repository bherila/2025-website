<?php

namespace App\Http\Requests\Webhooks;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class BrevoInboundRequest extends FormRequest
{
    /**
     * Authorize the request by comparing the shared secret passed on the
     * webhook URL (?secret=...) against the configured value. Brevo inbound
     * parsing does not sign payloads, so the secret URL is the auth mechanism.
     */
    public function authorize(): bool
    {
        $expected = config('services.brevo.inbound_secret');

        if (empty($expected)) {
            return false;
        }

        $provided = (string) ($this->query('secret') ?? $this->header('X-Brevo-Inbound-Secret', ''));

        return hash_equals((string) $expected, $provided);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1'],
            'items.*.From.Address' => ['required', 'string'],
            'items.*.Subject' => ['nullable', 'string'],
            'items.*.MessageId' => ['nullable', 'string'],
        ];
    }
}
