<?php

namespace App\Http\Resources;

use App\Models\ClassActionClaim;
use App\Models\FinanceTool\FinAccountLineItems;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ClassActionClaimResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var ClassActionClaim $claim */
        $claim = $this->resource;

        return [
            'id' => (int) $claim->id,
            'name' => $claim->name,
            'notification_received_on' => $this->dateString($claim->notification_received_on),
            'notification_email_copy' => $claim->notification_email_copy,
            'class_action_url' => $claim->class_action_url,
            'payment_election_submitted_on' => $this->dateString($claim->payment_election_submitted_on),
            'payment_received' => (bool) $claim->payment_received,
            'payment_received_on' => $this->dateString($claim->payment_received_on),
            'payment_fin_transaction_id' => $claim->payment_fin_transaction_id,
            'payment_transaction' => $this->paymentTransaction($claim),
            'notes' => $claim->notes,
            'created_at' => $this->dateString($claim->created_at),
            'updated_at' => $this->dateString($claim->updated_at),
        ];
    }

    /** @return array<string, mixed>|null */
    private function paymentTransaction(ClassActionClaim $claim): ?array
    {
        $transaction = $claim->relationLoaded('paymentTransaction') ? $claim->paymentTransaction : null;

        if (! $transaction instanceof FinAccountLineItems) {
            return null;
        }

        $account = $transaction->relationLoaded('account') ? $transaction->account : null;

        return [
            't_id' => (int) $transaction->t_id,
            'account_id' => $transaction->t_account !== null ? (int) $transaction->t_account : null,
            'account_name' => $account?->acct_name,
            'date' => $this->dateString($transaction->t_date),
            'amount' => $transaction->t_amt !== null ? (float) $transaction->t_amt : null,
            'description' => $transaction->t_description,
            'url' => $transaction->t_account !== null ? "/finance/account/{$transaction->t_account}/transactions" : null,
        ];
    }

    private function dateString(mixed $value): ?string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        if (is_string($value) && trim($value) !== '') {
            return $value;
        }

        return null;
    }
}
