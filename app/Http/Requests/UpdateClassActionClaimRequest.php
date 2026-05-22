<?php

namespace App\Http\Requests;

class UpdateClassActionClaimRequest extends ClassActionClaimRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'claim_id' => ['sometimes', 'nullable', 'string', 'max:128'],
            'pin' => ['sometimes', 'nullable', 'string', 'max:128'],
            'notification_received_on' => ['sometimes', 'nullable', 'date'],
            'notification_email_copy' => ['sometimes', 'nullable', 'string'],
            'class_action_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'payment_election_submitted_on' => ['sometimes', 'nullable', 'date'],
            'claim_submitted_on' => ['sometimes', 'nullable', 'date'],
            'claim_deadline' => ['sometimes', 'nullable', 'date'],
            'administrator' => ['sometimes', 'nullable', 'string', 'max:255'],
            'defendant' => ['sometimes', 'nullable', 'string', 'max:255'],
            'final_approval_hearing_on' => ['sometimes', 'nullable', 'date'],
            'expected_payment_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'expected_payment_on' => ['sometimes', 'nullable', 'date'],
            'actual_payment_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'payment_received' => ['sometimes', 'boolean'],
            'payment_received_on' => ['sometimes', 'nullable', 'date'],
            'payment_fin_transaction_id' => ['sometimes', 'nullable', 'integer', 'exists:fin_account_line_items,t_id'],
            'notes' => ['sometimes', 'nullable', 'string'],
        ];
    }
}
