<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\InvoiceKind;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyActivity;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\User;
use App\Services\ClientManagement\ClientInvoicingService;
use Carbon\Carbon;
use Tests\TestCase;

class ClientCompanyActivityTest extends TestCase
{
    private User $admin;

    private ClientCompany $company;

    private ClientAgreement $agreement;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = $this->createAdminUser();
        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Activity Co',
            'slug' => 'activity-co',
        ]);
        $this->agreement = ClientAgreement::factory()->for($this->company)->create([
            'agreement_text' => 'Activity terms',
            'active_date' => Carbon::parse('2026-01-01'),
            'monthly_retainer_hours' => 10,
            'monthly_retainer_fee' => 1000,
            'hourly_rate' => 150,
            'billing_cadence' => BillingCadence::Quarterly->value,
        ]);
    }

    public function test_invoice_generation_writes_company_activity(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15'));

        try {
            app(ClientInvoicingService::class)->generateAllInvoices($this->company);

            $activity = ClientCompanyActivity::query()->where('action', 'invoice.generated')->firstOrFail();
            $this->assertSame($this->company->id, $activity->client_company_id);
            $this->assertSame(InvoiceKind::CadencePeriod->value, $activity->payload['invoice_kind']);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_invoice_issue_mark_paid_and_void_write_company_activity(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-01'));

        try {
            $issueInvoice = $this->createDraftInvoice('INV-ACT-ISSUE');
            $paidInvoice = $this->createDraftInvoice('INV-ACT-PAID');
            $voidInvoice = $this->createDraftInvoice('INV-ACT-VOID');

            $this->actingAs($this->admin)
                ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$issueInvoice->client_invoice_id}/issue")
                ->assertOk();
            $this->actingAs($this->admin)
                ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$paidInvoice->client_invoice_id}/mark-paid")
                ->assertOk();
            $this->actingAs($this->admin)
                ->postJson("/api/client/mgmt/companies/{$this->company->id}/invoices/{$voidInvoice->client_invoice_id}/void")
                ->assertOk();

            $this->assertDatabaseHas('client_company_activity', [
                'client_company_id' => $this->company->id,
                'actor_user_id' => $this->admin->id,
                'action' => 'invoice.issued',
            ]);
            $this->assertDatabaseHas('client_company_activity', [
                'client_company_id' => $this->company->id,
                'actor_user_id' => $this->admin->id,
                'action' => 'invoice.marked_paid',
            ]);
            $this->assertDatabaseHas('client_company_activity', [
                'client_company_id' => $this->company->id,
                'actor_user_id' => $this->admin->id,
                'action' => 'invoice.voided',
            ]);
        } finally {
            Carbon::setTestNow();
        }
    }

    private function createDraftInvoice(string $invoiceNumber): ClientInvoice
    {
        return ClientInvoice::create([
            'client_company_id' => $this->company->id,
            'client_agreement_id' => $this->agreement->id,
            'period_start' => Carbon::parse('2026-01-01'),
            'period_end' => Carbon::parse('2026-03-31'),
            'cycle_start' => Carbon::parse('2026-01-01'),
            'cycle_end' => Carbon::parse('2026-03-31'),
            'invoice_number' => $invoiceNumber,
            'invoice_total' => 100,
            'status' => 'draft',
            'invoice_kind' => InvoiceKind::CadencePeriod->value,
        ]);
    }
}
