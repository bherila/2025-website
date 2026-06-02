<?php

namespace Tests\Unit\Services\ClientManagement;

use App\Enums\ClientManagement\InvoiceKind;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Services\ClientManagement\DataTransferObjects\BillingCycle;
use App\Services\ClientManagement\InterimOverageGenerator;
use Carbon\Carbon;
use Tests\TestCase;

class InterimOverageGeneratorTest extends TestCase
{
    public function test_interim_overage_hours_for_cycle_sums_only_non_void_matching_cycle_invoices(): void
    {
        $company = ClientCompany::factory()->create();
        $agreement = ClientAgreement::factory()->for($company)->create([
            'active_date' => '2026-01-01',
        ]);
        $cycle = new BillingCycle(
            start: Carbon::parse('2026-01-01'),
            end: Carbon::parse('2026-03-31'),
            isProrated: false,
            monthCount: 3,
            monthStarts: [
                Carbon::parse('2026-01-01'),
                Carbon::parse('2026-02-01'),
                Carbon::parse('2026-03-01'),
            ],
        );

        $this->createInterimInvoice($company, $agreement, '2026-01-01', '2026-01-31', 10.25);
        $this->createInterimInvoice($company, $agreement, '2026-02-01', '2026-02-28', 5.0);
        $this->createInterimInvoice($company, $agreement, '2026-03-01', '2026-03-31', 7.0, status: 'void');
        $this->createInterimInvoice($company, $agreement, '2026-04-01', '2026-04-30', 3.0);

        $this->assertSame(
            15.25,
            (new InterimOverageGenerator)->interimOverageHoursForCycle($agreement, $cycle),
        );
    }

    private function createInterimInvoice(
        ClientCompany $company,
        ClientAgreement $agreement,
        string $periodStart,
        string $periodEnd,
        float $hoursBilled,
        string $status = 'issued',
    ): ClientInvoice {
        return ClientInvoice::create([
            'client_company_id' => $company->id,
            'client_agreement_id' => $agreement->id,
            'period_start' => Carbon::parse($periodStart),
            'period_end' => Carbon::parse($periodEnd),
            'invoice_number' => 'INV-'.$periodStart,
            'invoice_total' => 0,
            'status' => $status,
            'invoice_kind' => InvoiceKind::InterimOverage->value,
            'cycle_start' => Carbon::parse($periodStart)->startOfQuarter(),
            'cycle_end' => Carbon::parse($periodStart)->endOfQuarter()->startOfDay(),
            'hours_billed_at_rate' => $hoursBilled,
        ]);
    }
}
