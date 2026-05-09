<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyPaymentMethod;
use App\Models\ClientManagement\ClientCompanyStripeCustomer;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoicePayment;
use App\Models\ClientManagement\ClientInvoiceStripeEvent;
use App\Models\ClientManagement\ClientInvoiceStripePayment;
use App\Models\User;
use App\Services\Billing\StripeBillingService;
use Carbon\Carbon;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class StripeBillingTest extends TestCase
{
    private User $client;

    private ClientCompany $company;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'client-management.stripe.max_amount_cents' => 100000,
            'services.stripe.secret_key' => 'sk_test_local',
            'services.stripe.webhook_secret' => 'whsec_local',
        ]);

        $this->client = User::factory()->create(['user_role' => 'user']);
        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Acme Billing',
            'slug' => 'acme-billing',
        ]);
        $this->company->users()->attach($this->client);
    }

    public function test_client_can_create_payment_intent_for_issued_invoice_under_cap(): void
    {
        $invoice = $this->createInvoice(['invoice_total' => 750.00]);

        $this->app->instance(StripeBillingService::class, new class extends StripeBillingService
        {
            public function __construct() {}

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
                $payment = ClientInvoiceStripePayment::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'stripe_payment_intent_id' => 'pi_test_123',
                    'stripe_customer_id' => 'cus_test_123',
                    'stripe_payment_method_id' => $savedPaymentMethod?->stripe_payment_method_id,
                    'amount' => 75000,
                    'status' => 'requires_payment_method',
                ]);

                return [
                    'payment' => $payment,
                    'client_secret' => 'pi_test_123_secret_abc',
                    'status' => 'requires_payment_method',
                    'publishable_key' => 'pk_test_123',
                ];
            }
        });

        $response = $this->actingAs($this->client)->postJson("/api/client/portal/invoices/{$invoice->client_invoice_id}/pay-intent", [
            'save_payment_method' => true,
            'return_url' => 'https://example.test/client/portal/acme-billing/invoice/'.$invoice->client_invoice_id,
        ]);

        $response->assertCreated()
            ->assertJsonPath('client_secret', 'pi_test_123_secret_abc')
            ->assertJsonPath('payment.stripe_payment_intent_id', 'pi_test_123');

        $this->assertDatabaseHas('client_invoice_stripe_payments', [
            'client_invoice_id' => $invoice->client_invoice_id,
            'stripe_payment_intent_id' => 'pi_test_123',
            'amount' => 75000,
        ]);
    }

    public function test_payment_intent_rejects_invoice_over_stripe_cap(): void
    {
        $invoice = $this->createInvoice(['invoice_total' => 1000.01]);

        $response = $this->actingAs($this->client)->postJson("/api/client/portal/invoices/{$invoice->client_invoice_id}/pay-intent", [
            'save_payment_method' => false,
        ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors('invoice');
    }

    public function test_payment_intent_requires_company_membership(): void
    {
        $invoice = $this->createInvoice();
        $outsider = User::factory()->create(['user_role' => 'user']);

        $response = $this->actingAs($outsider)->postJson("/api/client/portal/invoices/{$invoice->client_invoice_id}/pay-intent", []);

        $response->assertForbidden();
    }

    public function test_saved_payment_methods_are_scoped_to_company(): void
    {
        ClientCompanyPaymentMethod::factory()->create([
            'client_company_id' => $this->company->id,
            'stripe_payment_method_id' => 'pm_card_visa',
            'last4' => '4242',
            'is_default' => true,
        ]);
        ClientCompanyPaymentMethod::factory()->create([
            'client_company_id' => ClientCompany::factory()->create()->id,
            'stripe_payment_method_id' => 'pm_other',
            'last4' => '1881',
        ]);

        $response = $this->actingAs($this->client)->getJson("/api/client/portal/companies/{$this->company->id}/payment-methods");

        $response->assertOk()
            ->assertJsonCount(1, 'payment_methods')
            ->assertJsonPath('payment_methods.0.last4', '4242');
    }

    public function test_stripe_webhook_marks_invoice_paid_idempotently(): void
    {
        $invoice = $this->createInvoice(['invoice_total' => 500.00]);
        ClientInvoiceStripePayment::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'stripe_payment_intent_id' => 'pi_succeeded',
            'stripe_customer_id' => 'cus_acme',
            'stripe_payment_method_id' => 'pm_card',
            'amount' => 50000,
            'status' => 'processing',
        ]);

        $event = $this->paymentIntentEvent('evt_pi_succeeded', 'payment_intent.succeeded', [
            'id' => 'pi_succeeded',
            'amount' => 50000,
            'customer' => 'cus_acme',
            'payment_method' => [
                'id' => 'pm_card',
                'type' => 'card',
            ],
            'payment_method_types' => ['card'],
            'status' => 'succeeded',
            'metadata' => [
                'client_invoice_id' => (string) $invoice->client_invoice_id,
                'client_company_id' => (string) $this->company->id,
            ],
        ]);

        $this->postSignedStripeWebhook($event)->assertOk();
        $this->postSignedStripeWebhook($event)->assertOk();

        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertDatabaseCount('client_invoice_payments', 1);
        $this->assertDatabaseHas('client_invoice_payments', [
            'client_invoice_id' => $invoice->client_invoice_id,
            'stripe_payment_intent_id' => 'pi_succeeded',
            'payment_method' => 'stripe_card',
        ]);
        $this->assertSame(1, ClientInvoiceStripeEvent::where('stripe_event_id', 'evt_pi_succeeded')->count());
    }

    public function test_ach_processing_then_succeeded_keeps_invoice_issued_until_success(): void
    {
        $invoice = $this->createInvoice(['invoice_total' => 500.00]);

        $processingEvent = $this->paymentIntentEvent('evt_pi_processing', 'payment_intent.processing', [
            'id' => 'pi_ach',
            'amount' => 50000,
            'customer' => 'cus_acme',
            'payment_method' => [
                'id' => 'pm_bank',
                'type' => 'us_bank_account',
            ],
            'payment_method_types' => ['us_bank_account'],
            'status' => 'processing',
            'metadata' => [
                'client_invoice_id' => (string) $invoice->client_invoice_id,
                'client_company_id' => (string) $this->company->id,
            ],
        ]);

        $this->postSignedStripeWebhook($processingEvent)->assertOk();

        $invoice->refresh();
        $this->assertSame('issued', $invoice->status);
        $this->assertDatabaseMissing('client_invoice_payments', [
            'stripe_payment_intent_id' => 'pi_ach',
        ]);

        $succeededEvent = $this->paymentIntentEvent('evt_pi_ach_succeeded', 'payment_intent.succeeded', [
            'id' => 'pi_ach',
            'amount' => 50000,
            'customer' => 'cus_acme',
            'payment_method' => [
                'id' => 'pm_bank',
                'type' => 'us_bank_account',
            ],
            'payment_method_types' => ['us_bank_account'],
            'status' => 'succeeded',
            'metadata' => [
                'client_invoice_id' => (string) $invoice->client_invoice_id,
                'client_company_id' => (string) $this->company->id,
            ],
        ]);

        $this->postSignedStripeWebhook($succeededEvent)->assertOk();

        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertDatabaseHas('client_invoice_payments', [
            'stripe_payment_intent_id' => 'pi_ach',
            'payment_method' => 'stripe_ach',
        ]);
    }

    public function test_full_refund_reopens_paid_invoice(): void
    {
        [$invoice] = $this->createPaidStripeInvoice('pi_full_refund', 400.00);

        $event = $this->chargeRefundedEvent('evt_full_refund', 'pi_full_refund', 40000, 40000);

        $this->postSignedStripeWebhook($event)->assertOk();

        $invoice->refresh();
        $this->assertSame('issued', $invoice->status);
        $this->assertSoftDeleted('client_invoice_payments', [
            'stripe_payment_intent_id' => 'pi_full_refund',
        ]);
        $this->assertDatabaseHas('client_invoice_stripe_payments', [
            'stripe_payment_intent_id' => 'pi_full_refund',
            'status' => 'refunded',
        ]);
    }

    public function test_partial_refund_records_negative_payment_and_leaves_invoice_paid(): void
    {
        [$invoice, $stripePayment] = $this->createPaidStripeInvoice('pi_partial_refund', 500.00);

        $event = $this->chargeRefundedEvent('evt_partial_refund', 'pi_partial_refund', 50000, 10000);

        $this->postSignedStripeWebhook($event)->assertOk();

        $invoice = $invoice->fresh(['payments']);
        $this->assertNotNull($invoice);
        $this->assertSame('paid', $invoice->status);
        $this->assertEquals(400.00, $invoice->payments_total);
        $this->assertDatabaseHas('client_invoice_payments', [
            'client_invoice_id' => $invoice->client_invoice_id,
            'client_invoice_stripe_payment_id' => $stripePayment->id,
            'stripe_payment_intent_id' => 'pi_partial_refund_refund_evt_partial_refund',
            'payment_method' => 'stripe_refund',
        ]);
    }

    public function test_dispute_webhook_reopens_paid_invoice(): void
    {
        $invoice = $this->createInvoice(['invoice_total' => 250.00]);
        $stripePayment = ClientInvoiceStripePayment::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'stripe_payment_intent_id' => 'pi_disputed',
            'stripe_customer_id' => 'cus_acme',
            'stripe_payment_method_id' => 'pm_card',
            'amount' => 25000,
            'status' => 'succeeded',
        ]);
        ClientInvoicePayment::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'amount' => 250.00,
            'payment_date' => now()->toDateString(),
            'payment_method' => 'stripe_card',
            'client_invoice_stripe_payment_id' => $stripePayment->id,
            'stripe_payment_intent_id' => 'pi_disputed',
        ]);
        $invoice->markPaid(now()->toDateString());

        $event = [
            'id' => 'evt_dispute_created',
            'object' => 'event',
            'type' => 'charge.dispute.created',
            'data' => [
                'object' => [
                    'id' => 'dp_123',
                    'object' => 'dispute',
                    'payment_intent' => 'pi_disputed',
                    'charge' => 'ch_123',
                ],
            ],
        ];

        $this->postSignedStripeWebhook($event)->assertOk();

        $invoice->refresh();
        $this->assertSame('issued', $invoice->status);
        $this->assertDatabaseHas('client_invoice_stripe_payments', [
            'stripe_payment_intent_id' => 'pi_disputed',
            'status' => 'disputed',
        ]);
        $this->assertSoftDeleted('client_invoice_payments', [
            'stripe_payment_intent_id' => 'pi_disputed',
        ]);
    }

    public function test_dispute_lost_keeps_stripe_payment_disputed_and_invoice_payment_deleted(): void
    {
        [$invoice] = $this->createPaidStripeInvoice('pi_dispute_lost', 250.00);

        $this->postSignedStripeWebhook($this->disputeEvent('evt_dispute_lost_created', 'charge.dispute.created', 'pi_dispute_lost', 'needs_response'))->assertOk();
        $this->postSignedStripeWebhook($this->disputeEvent('evt_dispute_lost_closed', 'charge.dispute.closed', 'pi_dispute_lost', 'lost'))->assertOk();

        $invoice->refresh();
        $this->assertSame('issued', $invoice->status);
        $this->assertSoftDeleted('client_invoice_payments', [
            'stripe_payment_intent_id' => 'pi_dispute_lost',
        ]);
        $this->assertDatabaseHas('client_invoice_stripe_payments', [
            'stripe_payment_intent_id' => 'pi_dispute_lost',
            'status' => 'disputed',
        ]);
    }

    public function test_dispute_won_restores_invoice_payment_and_marks_invoice_paid(): void
    {
        [$invoice] = $this->createPaidStripeInvoice('pi_dispute_won', 250.00);

        $this->postSignedStripeWebhook($this->disputeEvent('evt_dispute_won_created', 'charge.dispute.created', 'pi_dispute_won', 'needs_response'))->assertOk();
        $this->postSignedStripeWebhook($this->disputeEvent('evt_dispute_won_closed', 'charge.dispute.closed', 'pi_dispute_won', 'won'))->assertOk();

        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertDatabaseHas('client_invoice_payments', [
            'stripe_payment_intent_id' => 'pi_dispute_won',
            'deleted_at' => null,
        ]);
        $this->assertDatabaseHas('client_invoice_stripe_payments', [
            'stripe_payment_intent_id' => 'pi_dispute_won',
            'status' => 'succeeded',
        ]);
    }

    public function test_setup_intent_webhook_saves_payment_method(): void
    {
        ClientCompanyStripeCustomer::create([
            'client_company_id' => $this->company->id,
            'stripe_customer_id' => 'cus_acme',
            'created_by' => $this->client->id,
        ]);

        $event = [
            'id' => 'evt_setup_succeeded',
            'object' => 'event',
            'type' => 'setup_intent.succeeded',
            'data' => [
                'object' => [
                    'id' => 'seti_123',
                    'object' => 'setup_intent',
                    'customer' => 'cus_acme',
                    'payment_method' => [
                        'id' => 'pm_saved_card',
                        'object' => 'payment_method',
                        'type' => 'card',
                        'card' => [
                            'brand' => 'visa',
                            'last4' => '4242',
                            'exp_month' => 12,
                            'exp_year' => 2031,
                        ],
                    ],
                ],
            ],
        ];

        $this->postSignedStripeWebhook($event)->assertOk();

        $this->assertDatabaseHas('client_company_payment_methods', [
            'client_company_id' => $this->company->id,
            'stripe_payment_method_id' => 'pm_saved_card',
            'brand' => 'visa',
            'last4' => '4242',
            'is_default' => true,
        ]);
    }

    public function test_detaching_default_payment_method_promotes_next_method(): void
    {
        $default = ClientCompanyPaymentMethod::factory()->create([
            'client_company_id' => $this->company->id,
            'stripe_payment_method_id' => 'pm_default',
            'is_default' => true,
            'created_at' => now()->subDay(),
        ]);
        $next = ClientCompanyPaymentMethod::factory()->create([
            'client_company_id' => $this->company->id,
            'stripe_payment_method_id' => 'pm_next',
            'is_default' => false,
            'created_at' => now(),
        ]);

        $service = new class extends StripeBillingService
        {
            public function __construct() {}

            protected function detachStripePaymentMethod(string $paymentMethodId): void {}
        };

        $service->detachPaymentMethod($default, $this->client);

        $this->assertSoftDeleted('client_company_payment_methods', [
            'id' => $default->id,
        ]);
        $this->assertTrue((bool) $next->fresh()?->is_default);
    }

    public function test_client_cannot_mutate_payment_method_for_another_company(): void
    {
        $otherCompany = ClientCompany::factory()->create();
        $otherMethod = ClientCompanyPaymentMethod::factory()->create([
            'client_company_id' => $otherCompany->id,
            'stripe_payment_method_id' => 'pm_other_company',
        ]);

        $this->actingAs($this->client)
            ->deleteJson("/api/client/portal/companies/{$this->company->id}/payment-methods/{$otherMethod->id}")
            ->assertNotFound();

        $this->actingAs($this->client)
            ->postJson("/api/client/portal/companies/{$this->company->id}/payment-methods/{$otherMethod->id}/default")
            ->assertNotFound();
    }

    public function test_admin_cannot_manually_create_synthetic_stripe_payment_method(): void
    {
        $admin = User::factory()->create(['user_role' => 'Admin']);
        $invoice = $this->createInvoice();

        $this->actingAs($admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/payments", [
                'amount' => 100.00,
                'payment_date' => now()->toDateString(),
                'payment_method' => 'stripe_card',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('payment_method');
    }

    public function test_unsigned_stripe_webhook_is_rejected(): void
    {
        $response = $this->call('POST', '/api/webhooks/stripe', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
        ], json_encode(['id' => 'evt_unsigned', 'type' => 'payment_intent.succeeded'], JSON_THROW_ON_ERROR));

        $response->assertBadRequest();
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createInvoice(array $overrides = []): ClientInvoice
    {
        return ClientInvoice::create(array_merge([
            'client_company_id' => $this->company->id,
            'period_start' => Carbon::parse('2026-04-01'),
            'period_end' => Carbon::parse('2026-04-30'),
            'status' => 'issued',
            'invoice_number' => 'INV-STRIPE-001',
            'invoice_total' => 500.00,
            'issue_date' => Carbon::parse('2026-05-01'),
            'due_date' => Carbon::parse('2026-05-15'),
            'retainer_hours_included' => 0,
            'hours_worked' => 0,
            'rollover_hours_used' => 0,
            'unused_hours_balance' => 0,
            'negative_hours_balance' => 0,
            'starting_unused_hours' => 0,
            'starting_negative_hours' => 0,
            'hours_billed_at_rate' => 0,
        ], $overrides));
    }

    /**
     * @return array{0: ClientInvoice, 1: ClientInvoiceStripePayment}
     */
    private function createPaidStripeInvoice(string $paymentIntentId, float $amount): array
    {
        $invoice = $this->createInvoice(['invoice_total' => $amount]);
        $stripePayment = ClientInvoiceStripePayment::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'stripe_payment_intent_id' => $paymentIntentId,
            'stripe_customer_id' => 'cus_acme',
            'stripe_payment_method_id' => 'pm_card',
            'amount' => (int) round($amount * 100),
            'status' => 'succeeded',
        ]);
        ClientInvoicePayment::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'amount' => $amount,
            'payment_date' => now()->toDateString(),
            'payment_method' => 'stripe_card',
            'client_invoice_stripe_payment_id' => $stripePayment->id,
            'stripe_payment_intent_id' => $paymentIntentId,
        ]);
        $invoice->markPaid(now()->toDateString());

        return [$invoice, $stripePayment];
    }

    /**
     * @param  array<string, mixed>  $object
     * @return array<string, mixed>
     */
    private function paymentIntentEvent(string $id, string $type, array $object): array
    {
        return [
            'id' => $id,
            'object' => 'event',
            'type' => $type,
            'data' => [
                'object' => array_merge([
                    'object' => 'payment_intent',
                    'currency' => 'usd',
                ], $object),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function chargeRefundedEvent(string $eventId, string $paymentIntentId, int $amount, int $amountRefunded): array
    {
        return [
            'id' => $eventId,
            'object' => 'event',
            'type' => 'charge.refunded',
            'data' => [
                'object' => [
                    'id' => 'ch_'.$paymentIntentId,
                    'object' => 'charge',
                    'payment_intent' => $paymentIntentId,
                    'amount' => $amount,
                    'amount_refunded' => $amountRefunded,
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function disputeEvent(string $eventId, string $type, string $paymentIntentId, string $status): array
    {
        return [
            'id' => $eventId,
            'object' => 'event',
            'type' => $type,
            'data' => [
                'object' => [
                    'id' => 'dp_'.$paymentIntentId,
                    'object' => 'dispute',
                    'payment_intent' => $paymentIntentId,
                    'charge' => 'ch_'.$paymentIntentId,
                    'status' => $status,
                ],
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $event
     */
    private function postSignedStripeWebhook(array $event): TestResponse
    {
        $payload = json_encode($event, JSON_THROW_ON_ERROR);
        $timestamp = time();
        $signature = 't='.$timestamp.',v1='.hash_hmac('sha256', $timestamp.'.'.$payload, 'whsec_local');

        return $this->call('POST', '/api/webhooks/stripe', [], [], [], [
            'HTTP_STRIPE_SIGNATURE' => $signature,
            'CONTENT_TYPE' => 'application/json',
        ], $payload);
    }
}
