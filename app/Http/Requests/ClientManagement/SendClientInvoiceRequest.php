<?php

namespace App\Http\Requests\ClientManagement;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class SendClientInvoiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('Admin');
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'to' => ['required', 'array', 'min:1'],
            'to.*' => ['email'],
            'cc' => ['nullable', 'array'],
            'cc.*' => ['email'],
            'note' => ['nullable', 'string', 'max:2000'],
            'save_as_billing_email' => ['nullable', 'boolean'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'to.required' => 'Add at least one recipient email address.',
            'to.*.email' => 'Each recipient must be a valid email address.',
            'cc.*.email' => 'Each CC must be a valid email address.',
        ];
    }

    /**
     * Recipient ("to") addresses, de-duplicated.
     *
     * @return list<string>
     */
    public function recipients(): array
    {
        return array_values(array_unique($this->validated('to')));
    }

    /**
     * CC addresses, de-duplicated.
     *
     * @return list<string>
     */
    public function ccRecipients(): array
    {
        return array_values(array_unique($this->validated('cc') ?? []));
    }

    public function note(): ?string
    {
        $note = $this->validated('note');

        return $note === null || trim($note) === '' ? null : $note;
    }

    public function shouldSaveBillingEmail(): bool
    {
        return (bool) $this->validated('save_as_billing_email');
    }
}
