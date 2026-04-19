<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\User;
use App\Services\ClientManagement\ClientInvoicingService;
use App\Services\ClientManagement\OverpaymentCreditService;
use Carbon\Carbon;
use Tests\TestCase;

/**
 * @see docs/client-management/overpayment-credits.md
 */
class OverpaymentCreditTest extends TestCase
{
    private ClientInvoicingService $invoicingService;

    private OverpaymentCreditService $creditService;

    private User $admin;

    private ClientCompany $company;

    private ClientAgreement $agreement;

    protected function setUp(): void
    {
        parent::setUp();

        $this->invoicingService = app(ClientInvoicingService::class);
        $this->creditService = new OverpaymentCreditService;

        $this->admin = User::factory()->create(['user_role' => 'Admin']);

        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Overpay Co',
            'slug' => 'overpay-co',
        ]);

        // Straightforward retainer: $1000 / 10h.
        $this->agreement = ClientAgreement::factory()->for($this->company)->create([
            'monthly_retainer_fee' => 1000.00,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150.00,
            'active_date' => Carbon::create(2026, 1, 1),
            'termination_date' => null,
            'rollover_months' => 3,
            'catch_up_threshold_hours' => 1.0,
        ]);
    }

    public function test_overpayment_is_now_accepted_without_422(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );
        $invoice->issue();

        $response = $this->actingAs($this->admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/payments", [
                'amount' => 1500.00,
                'payment_date' => '2026-02-05',
                'payment_method' => 'Wire',
            ]);

        $response->assertStatus(201);
        $invoice->refresh();
        $this->assertEquals('paid', $invoice->status);
    }

    public function test_overpayment_becomes_credit_on_next_draft(): void
    {
        $first = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );
        $first->issue();

        // Overpay by $200
        $first->payments()->create([
            'amount' => 1200.00,
            'payment_date' => '2026-02-05',
            'payment_method' => 'Wire',
        ]);
        $first->refresh()->markPaid();

        $this->assertEquals(200.0, $this->creditService->availableCreditForCompany($this->company));

        // Generate next draft
        $second = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 2, 1),
            Carbon::create(2026, 2, 28),
        );

        $creditLine = $second->lineItems->firstWhere('line_type', 'credit');
        $this->assertNotNull($creditLine, 'Next invoice should carry the credit');
        $this->assertEquals(-200.0, (float) $creditLine->line_total);
        $this->assertEquals(800.0, (float) $second->invoice_total, '$1000 retainer − $200 credit');
    }

    public function test_credit_caps_at_invoice_subtotal(): void
    {
        $first = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );
        $first->issue();

        // Overpay by $5000 (way more than the $1000 next invoice)
        $first->payments()->create([
            'amount' => 6000.00,
            'payment_date' => '2026-02-05',
            'payment_method' => 'Wire',
        ]);
        $first->refresh()->markPaid();

        $second = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 2, 1),
            Carbon::create(2026, 2, 28),
        );

        $creditLine = $second->lineItems->firstWhere('line_type', 'credit');
        $this->assertNotNull($creditLine);
        $this->assertEquals(-1000.0, (float) $creditLine->line_total, 'Credit capped at invoice subtotal');
        $this->assertEquals(0.0, (float) $second->invoice_total, 'Invoice cannot go negative');
    }

    public function test_remainder_rolls_to_next_invoice(): void
    {
        $first = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );
        $first->issue();

        // Overpay by $5000
        $first->payments()->create([
            'amount' => 6000.00,
            'payment_date' => '2026-02-05',
            'payment_method' => 'Wire',
        ]);
        $first->refresh()->markPaid();

        // Issue the February invoice so its credit counts as consumed
        $second = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 2, 1),
            Carbon::create(2026, 2, 28),
        );
        $second->issue();

        // $5000 - $1000 consumed on Feb = $4000 remaining
        $this->assertEquals(4000.0, $this->creditService->availableCreditForCompany($this->company));

        $third = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 3, 1),
            Carbon::create(2026, 3, 31),
        );

        $creditLine = $third->lineItems->firstWhere('line_type', 'credit');
        $this->assertNotNull($creditLine);
        $this->assertEquals(-1000.0, (float) $creditLine->line_total, 'March draft also credited');
    }

    public function test_voiding_source_removes_its_contribution(): void
    {
        $first = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );
        $first->issue();

        $first->payments()->create([
            'amount' => 1500.00,
            'payment_date' => '2026-02-05',
            'payment_method' => 'Wire',
        ]);
        $first->refresh()->markPaid();

        $this->assertEquals(500.0, $this->creditService->availableCreditForCompany($this->company));

        // Void the source — but we have to delete payments first per existing rule.
        $first->payments()->delete();
        $first->refresh();
        $first->update(['status' => 'void']);

        $this->assertEquals(0.0, $this->creditService->availableCreditForCompany($this->company), 'Voided invoice credit is gone');
    }

    public function test_issued_invoice_with_credit_is_not_modified(): void
    {
        // Overpay an initial invoice, then see that the second invoice issued with a credit
        // stays unchanged even after another payment adjusts the company's credit pool.
        $first = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );
        $first->issue();
        $first->payments()->create([
            'amount' => 1300.00,
            'payment_date' => '2026-02-05',
            'payment_method' => 'Wire',
        ]);
        $first->refresh()->markPaid();

        $second = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 2, 1),
            Carbon::create(2026, 2, 28),
        );
        $secondTotalBefore = (float) $second->invoice_total;
        $secondCreditBefore = (float) ($second->lineItems->firstWhere('line_type', 'credit')->line_total ?? 0);
        $second->issue();

        // A new overpayment appears — the issued invoice should be untouched.
        $first->payments()->create([
            'amount' => 200,
            'payment_date' => '2026-02-20',
            'payment_method' => 'Wire',
        ]);
        $second->refresh();

        $this->assertEquals($secondTotalBefore, (float) $second->invoice_total);
        $this->assertEquals(
            $secondCreditBefore,
            (float) ($second->lineItems->firstWhere('line_type', 'credit')->line_total ?? 0),
        );
    }

    public function test_ledger_itemises_per_invoice(): void
    {
        $first = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );
        $first->issue();
        $first->payments()->create([
            'amount' => 1300.00,
            'payment_date' => '2026-02-05',
            'payment_method' => 'Wire',
        ]);
        $first->refresh()->markPaid();

        $ledger = $this->creditService->buildLedger($this->company);
        $this->assertCount(1, $ledger->entries);
        $this->assertEquals(300.0, $ledger->entries[0]['overpaid']);
        $this->assertEquals(300.0, $ledger->totalRemaining);
    }
}
