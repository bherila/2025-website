<?php

namespace Tests\Feature\ClientManagement;

use App\Mail\ClientInvoiceMail;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\User;
use App\Services\ClientManagement\ClientInvoicingService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Feature tests for emailing an issued/paid client invoice
 * (POST /api/client/mgmt/companies/{company}/invoices/{invoice}/send).
 */
class SendClientInvoiceTest extends TestCase
{
    private ClientInvoicingService $invoicingService;

    private User $admin;

    private ClientCompany $company;

    private ClientAgreement $agreement;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();

        $this->invoicingService = app(ClientInvoicingService::class);

        $this->admin = User::factory()->create([
            'user_role' => 'admin',
        ]);

        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Send Test Company',
            'slug' => 'send-test-company',
        ]);

        $this->agreement = ClientAgreement::factory()->for($this->company)->create([
            'monthly_retainer_fee' => 1000.00,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150.00,
            'active_date' => Carbon::create(2024, 1, 1),
            'termination_date' => null,
            'rollover_months' => 3,
            'is_visible_to_client' => true,
        ]);
    }

    private function makeIssuedInvoice(): ClientInvoice
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $invoice->issue();

        return $invoice->fresh();
    }

    public function test_admin_can_email_an_issued_invoice(): void
    {
        $invoice = $this->makeIssuedInvoice();

        $this->assertNull($invoice->last_emailed_at);

        $response = $this->actingAs($this->admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/send", [
                'to' => ['billing@example.com'],
                'cc' => ['cc@example.com'],
                'note' => 'Please find your invoice attached.',
                'save_as_billing_email' => true,
            ]);

        $response->assertStatus(200);
        $response->assertJsonStructure(['message', 'last_emailed_at']);

        Mail::assertQueued(ClientInvoiceMail::class, function (ClientInvoiceMail $mail) use ($invoice): bool {
            return $mail->invoice->client_invoice_id === $invoice->client_invoice_id
                && $mail->hasTo('billing@example.com')
                && $mail->hasCc('cc@example.com');
        });

        $this->assertNotNull($invoice->fresh()->last_emailed_at, 'last_emailed_at should be set after sending');

        $this->assertDatabaseHas('client_company_activity', [
            'client_company_id' => $this->company->id,
            'action' => 'invoice.emailed',
            'subject_id' => $invoice->client_invoice_id,
        ]);

        $this->assertEquals('billing@example.com', $this->company->fresh()->billing_email);
    }

    public function test_save_as_billing_email_is_skipped_when_not_requested(): void
    {
        $invoice = $this->makeIssuedInvoice();
        $originalBillingEmail = $this->company->fresh()->billing_email;

        $this->actingAs($this->admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/send", [
                'to' => ['someone@example.com'],
            ])
            ->assertStatus(200);

        Mail::assertQueued(ClientInvoiceMail::class);
        $this->assertEquals($originalBillingEmail, $this->company->fresh()->billing_email);
    }

    public function test_cannot_email_a_draft_invoice(): void
    {
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2024, 1, 1),
            Carbon::create(2024, 1, 31)
        );

        $this->assertEquals('draft', $invoice->status);

        $this->actingAs($this->admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/send", [
                'to' => ['billing@example.com'],
            ])
            ->assertStatus(422);

        Mail::assertNothingQueued();
        $this->assertNull($invoice->fresh()->last_emailed_at);
    }

    public function test_send_requires_at_least_one_recipient(): void
    {
        $invoice = $this->makeIssuedInvoice();

        $this->actingAs($this->admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/send", [
                'to' => [],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('to');

        Mail::assertNothingQueued();
    }

    public function test_send_rejects_invalid_recipient_emails(): void
    {
        $invoice = $this->makeIssuedInvoice();

        $this->actingAs($this->admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/send", [
                'to' => ['not-an-email'],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('to.0');

        Mail::assertNothingQueued();
    }

    public function test_send_rejects_empty_recipient_email_entries(): void
    {
        $invoice = $this->makeIssuedInvoice();

        $this->actingAs($this->admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/send", [
                'to' => [''],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('to.0');

        Mail::assertNothingQueued();
    }

    public function test_send_rejects_empty_cc_email_entries(): void
    {
        $invoice = $this->makeIssuedInvoice();

        $this->actingAs($this->admin)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/send", [
                'to' => ['billing@example.com'],
                'cc' => [''],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('cc.0');

        Mail::assertNothingQueued();
    }

    public function test_non_admin_cannot_email_an_invoice(): void
    {
        $invoice = $this->makeIssuedInvoice();

        $regularUser = User::factory()->create([
            'user_role' => 'user',
        ]);

        $this->actingAs($regularUser)
            ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$invoice->client_invoice_id}/send", [
                'to' => ['billing@example.com'],
            ])
            ->assertStatus(403);

        Mail::assertNothingQueued();
        $this->assertNull($invoice->fresh()->last_emailed_at);
    }
}
