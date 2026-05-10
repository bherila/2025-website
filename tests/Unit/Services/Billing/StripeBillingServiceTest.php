<?php

namespace Tests\Unit\Services\Billing;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyPaymentMethod;
use App\Models\ClientManagement\ClientInvoice;
use App\Services\Billing\StripeBillingService;
use Carbon\Carbon;
use RuntimeException;
use Tests\TestCase;

class StripeBillingServiceTest extends TestCase
{
    public function test_invoice_eligibility_rejects_non_issued_invoices(): void
    {
        $service = new StripeBillingService;
        $invoice = $this->createInvoice(['status' => 'draft']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Only issued invoices can be paid with Stripe.');

        $service->assertInvoiceIsStripeEligible($invoice);
    }

    public function test_invoice_eligibility_rejects_invoices_above_cap(): void
    {
        config(['client-management.stripe.max_amount_cents' => 100000]);

        $service = new StripeBillingService;
        $invoice = $this->createInvoice(['invoice_total' => 1000.01]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Invoices over $1,000 must be paid manually.');

        $service->assertInvoiceIsStripeEligible($invoice);
    }

    public function test_list_saved_methods_returns_default_first(): void
    {
        $service = new StripeBillingService;
        $company = ClientCompany::factory()->create();

        ClientCompanyPaymentMethod::factory()->create([
            'client_company_id' => $company->id,
            'stripe_payment_method_id' => 'pm_secondary',
            'last4' => '1881',
            'is_default' => false,
        ]);
        ClientCompanyPaymentMethod::factory()->create([
            'client_company_id' => $company->id,
            'stripe_payment_method_id' => 'pm_default',
            'last4' => '4242',
            'is_default' => true,
        ]);

        $methods = $service->listSavedMethods($company);

        $this->assertCount(2, $methods);
        $this->assertSame('pm_default', $methods[0]->stripe_payment_method_id);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createInvoice(array $overrides = []): ClientInvoice
    {
        $company = ClientCompany::factory()->create();

        return ClientInvoice::create(array_merge([
            'client_company_id' => $company->id,
            'period_start' => Carbon::parse('2026-04-01'),
            'period_end' => Carbon::parse('2026-04-30'),
            'status' => 'issued',
            'invoice_number' => 'INV-ELIGIBLE',
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
}
