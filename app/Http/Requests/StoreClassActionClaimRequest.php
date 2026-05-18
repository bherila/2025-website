<?php

namespace App\Http\Requests;

class StoreClassActionClaimRequest extends ClassActionClaimRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'notification_received_on' => ['nullable', 'date'],
            'notification_email_copy' => ['nullable', 'string'],
            'class_action_url' => ['nullable', 'url', 'max:2048'],
            'payment_election_submitted_on' => ['nullable', 'date'],
            'payment_received' => ['sometimes', 'boolean'],
            'payment_received_on' => ['nullable', 'date'],
            'payment_fin_transaction_id' => ['nullable', 'integer', 'exists:fin_account_line_items,t_id'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
