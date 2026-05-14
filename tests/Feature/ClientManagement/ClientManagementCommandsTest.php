<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoicePayment;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class ClientManagementCommandsTest extends TestCase
{
    private User $admin;

    private ClientCompany $company;

    private ClientProject $project;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create([
            'id' => 1,
            'user_role' => 'admin',
        ]);

        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Command Test Co',
            'slug' => 'command-test-co',
        ]);

        $this->project = ClientProject::factory()->for($this->company)->create([
            'name' => 'Default Project',
            'slug' => 'default-project',
            'creator_user_id' => $this->admin->id,
        ]);
    }

    public function test_can_list_invoices_for_client_with_status_filter_and_balances(): void
    {
        $issuedInvoice = $this->createInvoice('CMD-202605-001', 'issued', 500.00);
        $this->createInvoice('CMD-202605-002', 'draft', 100.00);

        ClientInvoicePayment::create([
            'client_invoice_id' => $issuedInvoice->client_invoice_id,
            'amount' => 125.00,
            'payment_date' => '2026-05-14',
            'payment_method' => 'ACH',
        ]);

        $exitCode = Artisan::call('client-management:invoices', [
            '--client' => $this->company->slug,
            '--status' => ['issued'],
            '--format' => 'json',
        ]);

        $payload = json_decode(Artisan::output(), true);

        $this->assertSame(0, $exitCode);
        $this->assertCount(1, $payload);
        $this->assertSame($issuedInvoice->client_invoice_id, $payload[0]['id']);
        $this->assertSame('issued', $payload[0]['status']);
        $this->assertEquals(125.0, $payload[0]['payments_total']);
        $this->assertEquals(375.0, $payload[0]['remaining_balance']);
    }

    public function test_can_apply_payment_to_issued_invoice_and_mark_it_paid(): void
    {
        $invoice = $this->createInvoice('CMD-202605-003', 'issued', 250.00);

        $exitCode = Artisan::call('client-management:apply-payment', [
            'invoice' => (string) $invoice->client_invoice_id,
            'amount' => '250.00',
            'date' => '2026-05-14',
            '--format' => 'json',
        ]);

        $payload = json_decode(Artisan::output(), true);

        $this->assertSame(0, $exitCode);
        $this->assertSame('ACH', $payload['payment_method']);
        $this->assertEquals(0.0, $payload['remaining_balance']);

        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertSame('2026-05-14', $invoice->paid_date->toDateString());
        $this->assertDatabaseHas('client_invoice_payments', [
            'client_invoice_id' => $invoice->client_invoice_id,
            'amount' => 250.00,
            'payment_method' => 'ACH',
        ]);
    }

    public function test_apply_payment_rejects_draft_invoice(): void
    {
        $invoice = $this->createInvoice('CMD-202605-004', 'draft', 250.00);

        $exitCode = Artisan::call('client-management:apply-payment', [
            'invoice' => (string) $invoice->client_invoice_id,
            'amount' => '10.00',
            'date' => '2026-05-14',
        ]);

        $this->assertSame(1, $exitCode);
        $this->assertStringContainsString('Payments can only be applied to issued invoices', Artisan::output());
        $this->assertDatabaseMissing('client_invoice_payments', [
            'client_invoice_id' => $invoice->client_invoice_id,
        ]);
    }

    public function test_can_create_time_entry_and_infer_single_project_defaults(): void
    {
        $exitCode = Artisan::call('client-management:create-time-entry', [
            'client' => $this->company->slug,
            'description' => 'Implement command helpers',
            'time' => '1:30',
            'date' => '2026-05-14',
            '--format' => 'json',
        ]);

        $payload = json_decode(Artisan::output(), true);

        $this->assertSame(0, $exitCode);
        $this->assertSame($this->project->id, $payload['project_id']);
        $this->assertSame('1:30', $payload['time']);
        $this->assertTrue($payload['billable']);
        $this->assertFalse($payload['deferred']);
        $this->assertSame('Software Development', $payload['category']);

        $this->assertDatabaseHas('client_time_entries', [
            'id' => $payload['time_entry_id'],
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'name' => 'Implement command helpers',
            'minutes_worked' => 90,
            'user_id' => $this->admin->id,
            'creator_user_id' => $this->admin->id,
            'is_billable' => true,
            'is_deferred_billing' => false,
            'job_type' => 'Software Development',
        ]);
    }

    public function test_create_time_entry_requires_project_when_client_has_multiple_projects(): void
    {
        ClientProject::factory()->for($this->company)->create([
            'name' => 'Second Project',
            'slug' => 'second-project',
        ]);

        $exitCode = Artisan::call('client-management:create-time-entry', [
            'client' => $this->company->slug,
            'description' => 'Ambiguous project work',
            'time' => '1.0',
            'date' => '2026-05-14',
        ]);

        $this->assertSame(1, $exitCode);
        $this->assertStringContainsString('Pass --project=<id|slug|name>', Artisan::output());
        $this->assertSame(0, ClientTimeEntry::count());
    }

    private function createInvoice(string $invoiceNumber, string $status, float $total): ClientInvoice
    {
        return ClientInvoice::create([
            'client_company_id' => $this->company->id,
            'period_start' => '2026-04-01',
            'period_end' => '2026-04-30',
            'invoice_number' => $invoiceNumber,
            'invoice_total' => $total,
            'issue_date' => $status === 'draft' ? null : '2026-05-01',
            'due_date' => '2026-05-31',
            'paid_date' => $status === 'paid' ? '2026-05-14' : null,
            'retainer_hours_included' => 10,
            'hours_worked' => 8,
            'rollover_hours_used' => 0,
            'unused_hours_balance' => 2,
            'negative_hours_balance' => 0,
            'hours_billed_at_rate' => 0,
            'status' => $status,
        ]);
    }
}
