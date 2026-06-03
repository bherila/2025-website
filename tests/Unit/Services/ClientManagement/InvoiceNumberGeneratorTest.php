<?php

namespace Tests\Unit\Services\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Services\ClientManagement\InvoiceNumberGenerator;
use Carbon\Carbon;
use Tests\TestCase;

class InvoiceNumberGeneratorTest extends TestCase
{
    public function test_generates_company_prefixed_sequence_per_year_month(): void
    {
        $generator = new InvoiceNumberGenerator;
        $company = ClientCompany::factory()->create([
            'company_name' => 'Acme+Ops LLC',
            'slug' => 'acme-ops',
        ]);

        $this->assertSame('ACME-202606-001', $generator->generate($company, Carbon::parse('2026-06-30')));

        $this->createInvoice($company, 'ACME-202606-001');
        $this->createInvoice($company, 'ACME-202606-004');

        $this->assertSame('ACME-202606-005', $generator->generate($company, Carbon::parse('2026-06-30')));

        $this->createInvoice($company, 'ACME-202612-009');

        $this->assertSame('ACME-202701-001', $generator->generate($company, Carbon::parse('2027-01-31')));
    }

    public function test_generate_for_issue_month_uses_month_after_work_period(): void
    {
        $generator = new InvoiceNumberGenerator;
        $company = ClientCompany::factory()->create([
            'company_name' => 'Acme+Ops LLC',
            'slug' => 'acme-ops',
        ]);

        // Work period ending May 31 is issued in June, so the number is keyed to 202606.
        $this->assertSame('ACME-202606-001', $generator->generateForIssueMonth($company, Carbon::parse('2026-05-31')));

        // December work period rolls into the following January issue month.
        $this->assertSame('ACME-202701-001', $generator->generateForIssueMonth($company, Carbon::parse('2026-12-31')));
    }

    private function createInvoice(ClientCompany $company, string $invoiceNumber): void
    {
        ClientInvoice::create([
            'client_company_id' => $company->id,
            'period_start' => '2026-06-01',
            'period_end' => '2026-06-30',
            'invoice_number' => $invoiceNumber,
            'invoice_total' => 0,
            'status' => 'draft',
        ]);
    }
}
