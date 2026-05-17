<?php

namespace App\Services\Billing;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyActivity;
use App\Models\ClientManagement\ClientCompanyPaymentMethod;
use App\Models\ClientManagement\ClientCompanyStripeCustomer;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoicePayment;
use App\Models\ClientManagement\ClientInvoiceStripeEvent;
use App\Models\ClientManagement\ClientInvoiceStripePayment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use Stripe\Event as StripeEvent;
use Stripe\Exception\SignatureVerificationException;
use Stripe\StripeClient;
use Stripe\Webhook;
use UnexpectedValueException;

class StripeBillingService
{
    private ?StripeClient $stripe;

    public function __construct(?StripeClient $stripe = null)
    {
        $this->stripe = $stripe;
    }

    public function maxAmountCents(): int
    {
        return (int) config('client-management.stripe.max_amount_cents', 100000);
    }

    public function invoiceAmountCents(ClientInvoice $invoice): int
    {
        return (int) round(((float) $invoice->invoice_total) * 100);
    }

    public function invoiceRemainingBalanceCents(ClientInvoice $invoice): int
    {
        $invoice->loadMissing('payments');

        return max(0, (int) round(((float) $invoice->remaining_balance) * 100));
    }

    public function companyAllowsStripeBilling(ClientCompany $company): bool
    {
        return (bool) $company->stripe_billing_enabled;
    }

    /**
     * Ensures clientCompany and payments are loaded for eligibility checks.
     */
    public function assertInvoiceIsStripeEligible(ClientInvoice $invoice): void
    {
        $invoice->loadMissing('clientCompany', 'payments');

        if (! $invoice->clientCompany || ! $this->companyAllowsStripeBilling($invoice->clientCompany)) {
            throw new RuntimeException('Stripe billing is disabled for this client company.');
        }

        if ($invoice->status !== 'issued') {
            throw new RuntimeException('Only issued invoices can be paid with Stripe.');
        }

        if ($this->invoiceAmountCents($invoice) > $this->maxAmountCents()) {
            throw new RuntimeException('Invoices over $1,000 must be paid manually.');
        }

        if ($this->invoiceRemainingBalanceCents($invoice) < 1) {
            throw new RuntimeException('This invoice does not have a remaining balance.');
        }
    }

    public function ensureCustomer(ClientCompany $company, ?User $user = null): ClientCompanyStripeCustomer
    {
        $existing = ClientCompanyStripeCustomer::where('client_company_id', $company->id)->first();
        if ($existing) {
            return $existing;
        }

        $this->assertStripeIsConfigured();

        $customer = $this->stripe()->customers->create([
            'name' => $company->company_name,
            'metadata' => [
                'client_company_id' => (string) $company->id,
            ],
        ], [
            'idempotency_key' => 'client_company_customer_'.$company->id,
        ]);

        return ClientCompanyStripeCustomer::create([
            'client_company_id' => $company->id,
            'stripe_customer_id' => $customer->id,
            'created_by' => $user?->id,
        ]);
    }

    /**
     * @return array{client_secret: string|null, customer_id: string, publishable_key: string|null}
     */
    public function createSetupIntent(ClientCompany $company, User $user): array
    {
        if (! $this->companyAllowsStripeBilling($company)) {
            throw new RuntimeException('Stripe billing is disabled for this client company.');
        }

        $customer = $this->ensureCustomer($company, $user);

        $params = [
            'customer' => $customer->stripe_customer_id,
            'payment_method_types' => ['card', 'us_bank_account'],
            'usage' => 'off_session',
            'metadata' => [
                'client_company_id' => (string) $company->id,
                'created_by' => (string) $user->id,
            ],
        ];

        if ((bool) config('services.stripe.financial_connections_enabled', false)) {
            $params['payment_method_options'] = [
                'us_bank_account' => [
                    'financial_connections' => [
                        'permissions' => ['payment_method'],
                    ],
                ],
            ];
        }

        $intent = $this->stripe()->setupIntents->create($params, [
            'idempotency_key' => 'setup_intent_for_company_'.$company->id.'_'.Str::uuid(),
        ]);

        return [
            'client_secret' => $intent->client_secret,
            'customer_id' => $customer->stripe_customer_id,
            'publishable_key' => $this->publishableKey(),
        ];
    }

    /**
     * @return array{payment: ClientInvoiceStripePayment, client_secret: string|null, status: string, publishable_key: string|null}
     */
    public function createPaymentIntent(
        ClientInvoice $invoice,
        ?ClientCompanyPaymentMethod $savedPaymentMethod = null,
        bool $savePaymentMethod = false,
        ?User $user = null,
        ?string $returnUrl = null,
    ): array {
        $this->assertInvoiceIsStripeEligible($invoice);
        $this->assertStripeIsConfigured();

        $invoice->loadMissing('clientCompany');
        $company = $invoice->clientCompany;
        if (! $company) {
            throw new RuntimeException('Invoice is missing a client company.');
        }

        if ($savedPaymentMethod && (int) $savedPaymentMethod->client_company_id !== (int) $company->id) {
            throw new RuntimeException('Payment method does not belong to this company.');
        }

        $customer = $this->ensureCustomer($company, $user);
        $amountCents = $this->invoiceRemainingBalanceCents($invoice);
        $nonce = (string) Str::uuid();

        $params = [
            'amount' => $amountCents,
            'currency' => 'usd',
            'customer' => $customer->stripe_customer_id,
            'payment_method_types' => ['card', 'us_bank_account'],
            'metadata' => [
                'client_invoice_id' => (string) $invoice->client_invoice_id,
                'client_company_id' => (string) $company->id,
            ],
        ];

        if ($savedPaymentMethod) {
            $params['payment_method'] = $savedPaymentMethod->stripe_payment_method_id;
            $params['confirm'] = true;
            if ($returnUrl !== null) {
                $params['return_url'] = $returnUrl;
            }
        } elseif ($savePaymentMethod) {
            $params['setup_future_usage'] = 'off_session';
        }

        $intent = $this->stripe()->paymentIntents->create($params, [
            'idempotency_key' => 'payment_intent_for_invoice_'.$invoice->client_invoice_id.'_'.$nonce,
        ]);

        $payment = ClientInvoiceStripePayment::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'stripe_payment_intent_id' => $intent->id,
            'stripe_customer_id' => $customer->stripe_customer_id,
            'stripe_payment_method_id' => $this->paymentMethodIdFromObject($intent->payment_method ?? null),
            'amount' => $amountCents,
            'status' => $intent->status,
            'failure_reason' => $this->paymentIntentFailureReason($intent),
        ]);

        return [
            'payment' => $payment,
            'client_secret' => $intent->client_secret,
            'status' => $intent->status,
            'publishable_key' => $this->publishableKey(),
        ];
    }

    /**
     * @return list<ClientCompanyPaymentMethod>
     */
    public function listSavedMethods(ClientCompany $company): array
    {
        return $company->paymentMethods()
            ->orderByDesc('is_default')
            ->orderBy('created_at')
            ->get()
            ->all();
    }

    public function detachPaymentMethod(ClientCompanyPaymentMethod $paymentMethod, ?User $actor = null): void
    {
        $this->assertStripeIsConfigured();

        $this->detachStripePaymentMethod($paymentMethod->stripe_payment_method_id);
        $company = $paymentMethod->clientCompany;
        $wasDefault = (bool) $paymentMethod->is_default;
        $paymentMethod->delete();

        if ($wasDefault) {
            $next = ClientCompanyPaymentMethod::where('client_company_id', $paymentMethod->client_company_id)
                ->orderByDesc('created_at')
                ->first();
            if ($next) {
                $this->setDefaultPaymentMethod($next, $actor);
            }
        }

        if ($company) {
            ClientCompanyActivity::record($company, 'payment_method.removed', $paymentMethod, [
                'method' => $paymentMethod->type,
                'last4' => $paymentMethod->last4,
            ], $actor?->id);
        }
    }

    public function setDefaultPaymentMethod(ClientCompanyPaymentMethod $paymentMethod, ?User $actor = null): ClientCompanyPaymentMethod
    {
        return DB::transaction(function () use ($paymentMethod, $actor): ClientCompanyPaymentMethod {
            ClientCompanyPaymentMethod::where('client_company_id', $paymentMethod->client_company_id)
                ->lockForUpdate()
                ->get();

            ClientCompanyPaymentMethod::where('client_company_id', $paymentMethod->client_company_id)
                ->whereKeyNot($paymentMethod->getKey())
                ->update(['is_default' => false]);

            $paymentMethod->forceFill(['is_default' => true])->save();

            if ($paymentMethod->clientCompany) {
                ClientCompanyActivity::record($paymentMethod->clientCompany, 'payment_method.default_changed', $paymentMethod, [
                    'method' => $paymentMethod->type,
                    'last4' => $paymentMethod->last4,
                ], $actor?->id);
            }

            return $paymentMethod;
        });
    }

    /**
     * @throws SignatureVerificationException
     * @throws UnexpectedValueException
     */
    public function constructWebhookEvent(string $payload, ?string $signature): StripeEvent
    {
        $secret = (string) config('services.stripe.webhook_secret', '');
        if ($secret === '') {
            throw new UnexpectedValueException('Stripe webhook secret is not configured.');
        }

        if (! $signature) {
            throw SignatureVerificationException::factory('Missing Stripe signature.', $payload, null);
        }

        return Webhook::constructEvent($payload, $signature, $secret);
    }

    public function processWebhookEvent(StripeEvent $event): ClientInvoiceStripeEvent
    {
        $record = ClientInvoiceStripeEvent::where('stripe_event_id', $event->id)->first();
        if ($record?->processed_at !== null) {
            return $record;
        }

        $context = $this->prepareWebhookContext($event);

        if (! $record) {
            $record = ClientInvoiceStripeEvent::create([
                'stripe_event_id' => $event->id,
                'type' => $event->type,
                'payload' => $event->toArray(),
            ]);
        }

        try {
            DB::transaction(function () use ($event, $record, $context): void {
                $this->dispatchWebhookEvent($event, $context);
                $record->update(['processed_at' => now(), 'error' => null]);
            });
        } catch (PermanentStripeWebhookException $exception) {
            $record->update(['processed_at' => now(), 'error' => $exception->getMessage()]);
        } catch (\Throwable $throwable) {
            $record->update(['error' => $throwable->getMessage()]);

            throw $throwable;
        }

        return $record->fresh() ?? $record;
    }

    public function refreshPaymentIntentStatus(ClientInvoiceStripePayment $payment): ClientInvoiceStripePayment
    {
        $intent = $this->stripe()->paymentIntents->retrieve($payment->stripe_payment_intent_id);
        $status = (string) ($this->value($intent, 'status') ?? $payment->status);
        $eventId = 'client_poll_'.$payment->stripe_payment_intent_id;

        if ($status === 'succeeded' && $payment->status !== 'succeeded') {
            $this->handlePaymentIntentSucceeded($intent, $eventId);
        } elseif (in_array($status, ['processing', 'failed', 'canceled'], true) && $payment->status !== $status) {
            $this->handlePaymentIntentStatus($intent, $status, $eventId);
        } else {
            $this->recordPaymentIntent($intent, $status, $eventId);
        }

        return $payment->fresh() ?? $payment;
    }

    /**
     * @param  array{payment_intent_id?: string|null, payment_method?: mixed}  $context
     */
    private function dispatchWebhookEvent(StripeEvent $event, array $context): void
    {
        $object = $event->data->object;

        match ($event->type) {
            'payment_intent.succeeded' => $this->handlePaymentIntentSucceeded($object, $event->id),
            'payment_intent.processing' => $this->handlePaymentIntentStatus($object, 'processing', $event->id),
            'payment_intent.payment_failed' => $this->handlePaymentIntentStatus($object, 'failed', $event->id),
            'payment_intent.canceled' => $this->handlePaymentIntentStatus($object, 'canceled', $event->id),
            'charge.dispute.created' => $this->handleDisputeCreated($object, $event->id, $context['payment_intent_id'] ?? null),
            'charge.dispute.closed' => $this->handleDisputeClosed($object, $event->id, $context['payment_intent_id'] ?? null),
            'charge.refunded' => $this->handleChargeRefunded($object, $event->id, $context['payment_intent_id'] ?? null),
            'payment_method.attached' => $this->handlePaymentMethodAttached($object),
            'payment_method.detached' => $this->handlePaymentMethodDetached($object),
            'setup_intent.succeeded' => $this->handleSetupIntentSucceeded($object, $context['payment_method'] ?? null),
            default => null,
        };
    }

    /**
     * @return array{payment_intent_id?: string|null, payment_method?: mixed}
     */
    private function prepareWebhookContext(StripeEvent $event): array
    {
        $object = $event->data->object;

        return match ($event->type) {
            'charge.dispute.created',
            'charge.dispute.closed',
            'charge.refunded' => [
                'payment_intent_id' => $this->paymentIntentIdFromChargeLike($object),
            ],
            'setup_intent.succeeded' => [
                'payment_method' => $this->paymentMethodForSetupIntent($object),
            ],
            default => [],
        };
    }

    private function handlePaymentIntentSucceeded(mixed $intent, string $eventId): void
    {
        $stripePayment = $this->recordPaymentIntent($intent, 'succeeded', $eventId);
        $invoice = $stripePayment->invoice()->with('clientCompany', 'payments')->first();
        if (! $invoice || ! $invoice->clientCompany) {
            Log::warning('Stripe PaymentIntent could not be matched to an active client invoice.', [
                'stripe_payment_intent_id' => $stripePayment->stripe_payment_intent_id,
                'client_invoice_id' => $stripePayment->client_invoice_id,
            ]);

            throw new PermanentStripeWebhookException('Stripe PaymentIntent could not be matched to an active client invoice.');
        }

        $paymentMethodType = $this->paymentMethodTypeForIntent($intent, $stripePayment);
        $paymentMethod = $paymentMethodType === 'us_bank_account' ? 'stripe_ach' : 'stripe_card';

        $existingPayment = ClientInvoicePayment::withTrashed()
            ->where('stripe_payment_intent_id', $stripePayment->stripe_payment_intent_id)
            ->first();

        if (! $existingPayment) {
            ClientInvoicePayment::create([
                'client_invoice_id' => $invoice->client_invoice_id,
                'amount' => round($stripePayment->amount / 100, 2),
                'payment_date' => now()->toDateString(),
                'payment_method' => $paymentMethod,
                'notes' => 'Stripe payment '.$stripePayment->stripe_payment_intent_id,
                'client_invoice_stripe_payment_id' => $stripePayment->id,
                'stripe_payment_intent_id' => $stripePayment->stripe_payment_intent_id,
            ]);
        } elseif ($existingPayment->trashed()) {
            $existingPayment->restore();
        }

        $this->refreshInvoicePaymentStatus($invoice);
        ClientCompanyActivity::record($invoice->clientCompany, 'invoice.payment_received', $invoice, [
            'method' => $paymentMethod,
            'amount' => round($stripePayment->amount / 100, 2),
            'stripe_payment_intent_id' => $stripePayment->stripe_payment_intent_id,
        ], null);
    }

    private function handlePaymentIntentStatus(mixed $intent, string $status, string $eventId): void
    {
        $stripePayment = $this->recordPaymentIntent($intent, $status, $eventId);
        $invoice = $stripePayment->invoice()->with('clientCompany')->first();

        if ($invoice?->clientCompany && in_array($status, ['failed', 'canceled'], true)) {
            ClientCompanyActivity::record($invoice->clientCompany, 'invoice.payment_failed', $invoice, [
                'stripe_payment_intent_id' => $stripePayment->stripe_payment_intent_id,
                'failure_reason' => $stripePayment->failure_reason,
            ], null);
        }
    }

    private function handleDisputeCreated(mixed $dispute, string $eventId, ?string $paymentIntentId): void
    {
        $stripePayment = $this->stripePaymentFromPaymentIntentId($paymentIntentId);
        if (! $stripePayment) {
            return;
        }

        $stripePayment->update(['status' => 'disputed', 'last_event_id' => $eventId]);
        $invoice = $stripePayment->invoice()->with('clientCompany')->first();

        ClientInvoicePayment::where('stripe_payment_intent_id', $stripePayment->stripe_payment_intent_id)->delete();

        if ($invoice) {
            $this->refreshInvoicePaymentStatus($invoice);
        }

        if ($invoice?->clientCompany) {
            ClientCompanyActivity::record($invoice->clientCompany, 'invoice.payment_disputed', $invoice, [
                'stripe_payment_intent_id' => $stripePayment->stripe_payment_intent_id,
            ], null);
        }
    }

    private function handleDisputeClosed(mixed $dispute, string $eventId, ?string $paymentIntentId): void
    {
        $stripePayment = $this->stripePaymentFromPaymentIntentId($paymentIntentId);
        if (! $stripePayment) {
            return;
        }

        $status = (string) ($this->value($dispute, 'status') ?? '');
        if ($status === 'won') {
            ClientInvoicePayment::withTrashed()
                ->where('stripe_payment_intent_id', $stripePayment->stripe_payment_intent_id)
                ->get()
                ->each(fn (ClientInvoicePayment $payment) => $payment->restore());

            $stripePayment->update(['status' => 'succeeded', 'last_event_id' => $eventId]);
            $invoice = $stripePayment->invoice()->first();
            if ($invoice) {
                $this->refreshInvoicePaymentStatus($invoice);
            }

            return;
        }

        $stripePayment->update(['status' => 'disputed', 'last_event_id' => $eventId]);
    }

    private function handleChargeRefunded(mixed $charge, string $eventId, ?string $paymentIntentId): void
    {
        $stripePayment = $this->stripePaymentFromPaymentIntentId($paymentIntentId);
        if (! $stripePayment) {
            return;
        }

        $amountRefunded = (int) ($this->value($charge, 'amount_refunded') ?? 0);
        $amount = (int) ($this->value($charge, 'amount') ?? $stripePayment->amount);
        $invoice = $stripePayment->invoice()->with('clientCompany')->first();
        if (! $invoice) {
            return;
        }

        if ($amountRefunded >= $amount) {
            ClientInvoicePayment::where('stripe_payment_intent_id', $stripePayment->stripe_payment_intent_id)->delete();
            $stripePayment->update(['status' => 'refunded', 'last_event_id' => $eventId]);
            $this->refreshInvoicePaymentStatus($invoice);
        } elseif ($amountRefunded > 0) {
            ClientInvoicePayment::firstOrCreate([
                'client_invoice_id' => $invoice->client_invoice_id,
                'stripe_payment_intent_id' => $stripePayment->stripe_payment_intent_id.'_refund_'.$eventId,
            ], [
                'amount' => -round($amountRefunded / 100, 2),
                'payment_date' => now()->toDateString(),
                'payment_method' => 'stripe_refund',
                'notes' => 'Stripe partial refund for '.$stripePayment->stripe_payment_intent_id,
                'client_invoice_stripe_payment_id' => $stripePayment->id,
            ]);
            $stripePayment->update(['status' => 'refunded', 'last_event_id' => $eventId]);
            $this->refreshInvoicePaymentStatus($invoice);
        }

        if ($invoice->clientCompany) {
            ClientCompanyActivity::record($invoice->clientCompany, 'invoice.payment_refunded', $invoice, [
                'stripe_payment_intent_id' => $stripePayment->stripe_payment_intent_id,
                'amount' => round($amountRefunded / 100, 2),
                'full_refund' => $amountRefunded >= $amount,
            ], null);
        }
    }

    private function handlePaymentMethodAttached(mixed $paymentMethod): void
    {
        $customerId = (string) ($this->value($paymentMethod, 'customer') ?? '');
        $customer = ClientCompanyStripeCustomer::where('stripe_customer_id', $customerId)->first();
        if (! $customer) {
            return;
        }

        $this->syncPaymentMethod($customer->clientCompany, $paymentMethod);
    }

    private function handlePaymentMethodDetached(mixed $paymentMethod): void
    {
        $paymentMethodId = (string) ($this->value($paymentMethod, 'id') ?? '');
        ClientCompanyPaymentMethod::where('stripe_payment_method_id', $paymentMethodId)->delete();
    }

    private function handleSetupIntentSucceeded(mixed $setupIntent, mixed $paymentMethod): void
    {
        $customerId = (string) ($this->value($setupIntent, 'customer') ?? '');
        $customer = ClientCompanyStripeCustomer::where('stripe_customer_id', $customerId)->first();
        if (! $customer) {
            return;
        }

        $saved = $this->syncPaymentMethod($customer->clientCompany, $paymentMethod);

        ClientCompanyActivity::record($customer->clientCompany, 'payment_method.added', $saved, [
            'method' => $saved->type,
            'last4' => $saved->last4,
        ], null);
    }

    private function syncPaymentMethod(ClientCompany $company, mixed $paymentMethod): ClientCompanyPaymentMethod
    {
        return DB::transaction(function () use ($company, $paymentMethod): ClientCompanyPaymentMethod {
            ClientCompanyPaymentMethod::withTrashed()
                ->where('client_company_id', $company->id)
                ->lockForUpdate()
                ->get();

            $paymentMethodId = (string) ($this->value($paymentMethod, 'id') ?? '');
            if ($paymentMethodId === '') {
                throw new PermanentStripeWebhookException('Stripe PaymentMethod is missing an id.');
            }

            $type = (string) ($this->value($paymentMethod, 'type') ?? 'card');
            $card = $this->value($paymentMethod, 'card');
            $bank = $this->value($paymentMethod, 'us_bank_account');

            $attributes = [
                'client_company_id' => $company->id,
                'type' => $type,
                'brand' => $this->value($card, 'brand'),
                'last4' => $this->value($card, 'last4') ?? $this->value($bank, 'last4'),
                'exp_month' => $this->value($card, 'exp_month'),
                'exp_year' => $this->value($card, 'exp_year'),
                'bank_name' => $this->value($bank, 'bank_name'),
            ];

            $method = ClientCompanyPaymentMethod::withTrashed()->updateOrCreate(
                ['stripe_payment_method_id' => $paymentMethodId],
                $attributes,
            );

            if ($method->trashed()) {
                $method->restore();
            }

            if (! ClientCompanyPaymentMethod::where('client_company_id', $company->id)->where('is_default', true)->exists()) {
                $method->forceFill(['is_default' => true])->save();
            }

            return $method;
        });
    }

    private function recordPaymentIntent(mixed $intent, string $fallbackStatus, string $eventId): ClientInvoiceStripePayment
    {
        $intentId = (string) ($this->value($intent, 'id') ?? '');
        $metadata = $this->toArray($this->value($intent, 'metadata'));
        $payment = ClientInvoiceStripePayment::where('stripe_payment_intent_id', $intentId)->first();

        if (! $payment) {
            $invoiceId = (int) ($metadata['client_invoice_id'] ?? 0);
            if ($invoiceId < 1) {
                throw new PermanentStripeWebhookException('Stripe PaymentIntent is missing client_invoice_id metadata.');
            }

            if (! ClientInvoice::whereKey($invoiceId)->exists()) {
                throw new PermanentStripeWebhookException('Stripe PaymentIntent references an invoice that does not exist or is no longer active.');
            }

            $payment = new ClientInvoiceStripePayment([
                'client_invoice_id' => $invoiceId,
                'stripe_payment_intent_id' => $intentId,
                'stripe_customer_id' => (string) ($this->value($intent, 'customer') ?? ''),
                'amount' => (int) ($this->value($intent, 'amount') ?? 0),
            ]);
        }

        $payment->fill([
            'stripe_customer_id' => (string) ($this->value($intent, 'customer') ?? $payment->stripe_customer_id),
            'stripe_payment_method_id' => $this->paymentMethodIdFromObject($this->value($intent, 'payment_method')) ?? $payment->stripe_payment_method_id,
            'amount' => (int) ($this->value($intent, 'amount') ?? $payment->amount),
            'status' => (string) ($this->value($intent, 'status') ?? $fallbackStatus),
            'failure_reason' => $this->paymentIntentFailureReason($intent),
            'last_event_id' => $eventId,
        ]);
        $payment->save();

        return $payment;
    }

    private function stripePaymentFromPaymentIntentId(?string $paymentIntentId): ?ClientInvoiceStripePayment
    {
        if (! $paymentIntentId) {
            return null;
        }

        return ClientInvoiceStripePayment::where('stripe_payment_intent_id', $paymentIntentId)->first();
    }

    private function paymentIntentIdFromChargeLike(mixed $chargeLike): ?string
    {
        $paymentIntent = $this->value($chargeLike, 'payment_intent');
        if (is_string($paymentIntent)) {
            return $paymentIntent;
        }

        if ($paymentIntent) {
            return (string) ($this->value($paymentIntent, 'id') ?? '');
        }

        $charge = $this->value($chargeLike, 'charge');
        if (is_string($charge) && $charge !== '') {
            return $this->paymentIntentIdFromChargeLike($this->retrieveStripeCharge($charge));
        }

        if (is_array($charge) || is_object($charge)) {
            return $this->paymentIntentIdFromChargeLike($charge);
        }

        return null;
    }

    private function refreshInvoicePaymentStatus(ClientInvoice $invoice): void
    {
        $fresh = $invoice->fresh(['payments']);
        if (! $fresh) {
            return;
        }

        if ($fresh->remaining_balance <= 0) {
            $latestPaymentDate = $fresh->payments()->max('payment_date') ?: now()->toDateString();
            $fresh->markPaid($latestPaymentDate);

            return;
        }

        if ($fresh->status === 'paid') {
            $fresh->update(['status' => 'issued', 'paid_date' => null]);
        }
    }

    private function paymentMethodTypeForIntent(mixed $intent, ClientInvoiceStripePayment $stripePayment): string
    {
        if ($stripePayment->stripe_payment_method_id) {
            $saved = ClientCompanyPaymentMethod::where('stripe_payment_method_id', $stripePayment->stripe_payment_method_id)->first();
            if ($saved) {
                return $saved->type;
            }
        }

        $paymentMethod = $this->value($intent, 'payment_method');
        $type = $this->value($paymentMethod, 'type');
        if (is_string($type) && $type !== '') {
            return $type;
        }

        $types = $this->value($intent, 'payment_method_types');
        if (is_array($types) && isset($types[0]) && is_string($types[0])) {
            return $types[0];
        }

        return 'card';
    }

    private function paymentMethodIdFromObject(mixed $paymentMethod): ?string
    {
        if (is_string($paymentMethod)) {
            return $paymentMethod;
        }

        $id = $this->value($paymentMethod, 'id');

        return is_string($id) && $id !== '' ? $id : null;
    }

    private function paymentIntentFailureReason(mixed $intent): ?string
    {
        $error = $this->value($intent, 'last_payment_error');

        if (! $error) {
            return null;
        }

        $message = $this->value($error, 'message');

        return is_string($message) && $message !== '' ? $message : null;
    }

    private function assertStripeIsConfigured(): void
    {
        if ($this->secretKey() === '') {
            throw new RuntimeException('Stripe secret key is not configured.');
        }
    }

    private function stripe(): StripeClient
    {
        if ($this->stripe instanceof StripeClient) {
            return $this->stripe;
        }

        $this->assertStripeIsConfigured();
        $this->stripe = new StripeClient($this->secretKey());

        return $this->stripe;
    }

    protected function detachStripePaymentMethod(string $paymentMethodId): void
    {
        $this->stripe()->paymentMethods->detach($paymentMethodId);
    }

    protected function retrieveStripeCharge(string $chargeId): mixed
    {
        return $this->stripe()->charges->retrieve($chargeId);
    }

    protected function retrieveStripePaymentMethod(string $paymentMethodId): mixed
    {
        return $this->stripe()->paymentMethods->retrieve($paymentMethodId);
    }

    private function paymentMethodForSetupIntent(mixed $setupIntent): mixed
    {
        $paymentMethod = $this->value($setupIntent, 'payment_method');
        if (is_string($paymentMethod)) {
            return $this->retrieveStripePaymentMethod($paymentMethod);
        }

        return $paymentMethod;
    }

    private function secretKey(): string
    {
        return (string) config('services.stripe.secret_key', '');
    }

    private function publishableKey(): ?string
    {
        $key = config('services.stripe.publishable_key');

        return is_string($key) && $key !== '' ? $key : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function toArray(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (is_object($value) && method_exists($value, 'toArray')) {
            /** @var array<string, mixed> $array */
            $array = $value->toArray();

            return $array;
        }

        return [];
    }

    private function value(mixed $value, string $key): mixed
    {
        if (is_array($value)) {
            return $value[$key] ?? null;
        }

        if (is_object($value)) {
            return $value->{$key} ?? null;
        }

        return null;
    }
}
