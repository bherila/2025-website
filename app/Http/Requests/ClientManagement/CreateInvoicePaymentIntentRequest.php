<?php

namespace App\Http\Requests\ClientManagement;

use App\Models\ClientManagement\ClientCompanyPaymentMethod;
use App\Models\ClientManagement\ClientInvoice;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class CreateInvoicePaymentIntentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'saved_payment_method_id' => [
                'nullable',
                'integer',
                Rule::exists('client_company_payment_methods', 'id')->whereNull('deleted_at'),
            ],
            'save_payment_method' => ['sometimes', 'boolean'],
            'return_url' => ['nullable', 'string', 'max:2048'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $invoice = $this->routeInvoice();
            if (! $invoice) {
                $validator->errors()->add('invoice', 'Invoice could not be found.');

                return;
            }

            $invoice->loadMissing('clientCompany', 'payments');

            if (! $invoice->clientCompany?->stripe_billing_enabled) {
                $validator->errors()->add('invoice', 'Stripe billing is disabled for this client company.');
            }

            if ($invoice->status !== 'issued') {
                $validator->errors()->add('invoice', 'Only issued invoices can be paid online.');
            }

            $invoiceTotalCents = (int) round(((float) $invoice->invoice_total) * 100);
            $maxAmountCents = (int) config('client-management.stripe.max_amount_cents', 100000);
            if ($invoiceTotalCents > $maxAmountCents) {
                $validator->errors()->add('invoice', 'Invoices over $1,000 must be paid manually.');
            }

            if ((float) $invoice->remaining_balance <= 0.0) {
                $validator->errors()->add('invoice', 'This invoice does not have a remaining balance.');
            }

            $paymentMethodId = $this->integer('saved_payment_method_id');
            if ($paymentMethodId > 0) {
                $paymentMethod = ClientCompanyPaymentMethod::find($paymentMethodId);
                if (! $paymentMethod || (int) $paymentMethod->client_company_id !== (int) $invoice->client_company_id) {
                    $validator->errors()->add('saved_payment_method_id', 'The selected payment method does not belong to this company.');
                }
            }
        });
    }

    private function routeInvoice(): ?ClientInvoice
    {
        $invoice = $this->route('invoice');

        return $invoice instanceof ClientInvoice ? $invoice : null;
    }
}
