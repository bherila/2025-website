<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Http\Requests\ClientManagement\CreateInvoicePaymentIntentRequest;
use App\Models\ClientManagement\ClientCompanyPaymentMethod;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceStripePayment;
use App\Models\User;
use App\Services\Billing\StripeBillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

class ClientInvoicePaymentIntentApiController extends Controller
{
    public function store(
        CreateInvoicePaymentIntentRequest $request,
        ClientInvoice $invoice,
        StripeBillingService $billing,
    ): JsonResponse {
        Gate::authorize('ClientCompanyMember', $invoice->client_company_id);

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();
        $savedPaymentMethod = isset($validated['saved_payment_method_id'])
            ? ClientCompanyPaymentMethod::find((int) $validated['saved_payment_method_id'])
            : null;

        $result = $billing->createPaymentIntent(
            $invoice,
            $savedPaymentMethod,
            (bool) ($validated['save_payment_method'] ?? false),
            $user,
            $validated['return_url'] ?? null,
        );

        return response()->json([
            'payment' => $result['payment']->toActivityArray(),
            'client_secret' => $result['client_secret'],
            'status' => $result['status'],
            'publishable_key' => $result['publishable_key'],
        ], 201);
    }

    public function show(ClientInvoice $invoice, string $paymentIntent): JsonResponse
    {
        Gate::authorize('ClientCompanyMember', $invoice->client_company_id);

        $payment = ClientInvoiceStripePayment::where('client_invoice_id', $invoice->client_invoice_id)
            ->where(function ($query) use ($paymentIntent): void {
                $query->where('stripe_payment_intent_id', $paymentIntent);

                if (ctype_digit($paymentIntent)) {
                    $query->orWhere('id', (int) $paymentIntent);
                }
            })
            ->firstOrFail();

        return response()->json([
            'payment' => $payment->toActivityArray(),
            'invoice' => $invoice->fresh()?->toDetailedArray(),
        ]);
    }
}
