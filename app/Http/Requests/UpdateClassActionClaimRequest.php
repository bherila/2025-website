<?php

namespace App\Http\Requests;

use App\Models\FinanceTool\FinAccountLineItems;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateClassActionClaimRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

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
