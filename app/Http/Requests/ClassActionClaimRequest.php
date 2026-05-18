<?php

namespace App\Http\Requests;

use App\Models\FinanceTool\FinAccountLineItems;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

abstract class ClassActionClaimRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'name.required' => 'Class action name is required.',
            'class_action_url.url' => 'Class action URL must be a valid URL.',
            'payment_fin_transaction_id.exists' => 'Payment transaction could not be found.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (! $this->filled('payment_fin_transaction_id')) {
                return;
            }

            if (! $this->paymentTransactionBelongsToUser((int) $this->input('payment_fin_transaction_id'))) {
                $validator->errors()->add('payment_fin_transaction_id', 'Payment transaction must belong to your finance accounts.');
            }
        });
    }

    private function paymentTransactionBelongsToUser(int $transactionId): bool
    {
        return FinAccountLineItems::query()
            ->whereKey($transactionId)
            ->whereHas('account', fn (Builder $query): Builder => $query->where('acct_owner', auth()->id()))
            ->exists();
    }
}
