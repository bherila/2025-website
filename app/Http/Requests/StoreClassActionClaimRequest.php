<?php

namespace App\Http\Requests;

class StoreClassActionClaimRequest extends ClassActionClaimRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'claim_id' => ['nullable', 'string', 'max:128'],
            'pin' => ['nullable', 'string', 'max:128'],
            'notification_received_on' => ['nullable', 'date'],
            'notification_email_copy' => ['nullable', 'string'],
            'class_action_url' => ['nullable', 'url', 'max:2048'],
            'payment_election_submitted_on' => ['nullable', 'date'],
            'claim_submitted_on' => ['nullable', 'date'],
            'claim_deadline' => ['nullable', 'date'],
            'administrator' => ['nullable', 'string', 'max:255'],
            'defendant' => ['nullable', 'string', 'max:255'],
            'final_approval_hearing_on' => ['nullable', 'date'],
            'expected_payment_amount' => ['nullable', 'numeric', 'min:0'],
            'expected_payment_on' => ['nullable', 'date'],
            'actual_payment_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_received' => ['sometimes', 'boolean'],
            'payment_received_on' => ['nullable', 'date'],
            'payment_fin_transaction_id' => ['nullable', 'integer', 'exists:fin_account_line_items,t_id'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
