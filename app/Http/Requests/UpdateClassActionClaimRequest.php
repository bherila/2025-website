<?php

namespace App\Http\Requests;

class UpdateClassActionClaimRequest extends ClassActionClaimRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'notification_received_on' => ['sometimes', 'nullable', 'date'],
            'notification_email_copy' => ['sometimes', 'nullable', 'string'],
            'class_action_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'payment_election_submitted_on' => ['sometimes', 'nullable', 'date'],
            'payment_received' => ['sometimes', 'boolean'],
            'payment_received_on' => ['sometimes', 'nullable', 'date'],
            'payment_fin_transaction_id' => ['sometimes', 'nullable', 'integer', 'exists:fin_account_line_items,t_id'],
            'notes' => ['sometimes', 'nullable', 'string'],
        ];
    }
}
