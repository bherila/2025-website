<?php

namespace Tests\Unit\Services\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Services\ClientManagement\DataTransferObjects\ClosingBalance;
use App\Services\ClientManagement\DataTransferObjects\MonthSummary;
use App\Services\ClientManagement\DataTransferObjects\OpeningBalance;
use App\Services\ClientManagement\InvoiceLedgerBuilder;
use Carbon\Carbon;
use Tests\TestCase;

class InvoiceLedgerBuilderTest extends TestCase
{
    public function test_build_agreement_ledger_through_summarizes_monthly_entries(): void
    {
        $company = ClientCompany::factory()->create();
        $project = ClientProject::factory()->for($company)->create();
        $agreement = ClientAgreement::factory()->for($company)->create([
            'active_date' => '2026-01-01',
            'termination_date' => null,
            'monthly_retainer_hours' => 10,
            'rollover_months' => 0,
            'initial_rollover_hours' => 0,
            'retainer_hours' => null,
        ]);

        ClientTimeEntry::factory()->for($company, 'clientCompany')->for($project, 'project')->create([
            'date_worked' => '2026-01-15',
            'minutes_worked' => 120,
            'is_billable' => true,
        ]);
        ClientTimeEntry::factory()->for($company, 'clientCompany')->for($project, 'project')->create([
            'date_worked' => '2026-01-20',
            'minutes_worked' => 60,
            'is_billable' => false,
        ]);

        $ledger = (new InvoiceLedgerBuilder)->buildAgreementLedgerThrough(
            $company,
            $agreement,
            Carbon::parse('2026-01-31'),
        );

        $this->assertCount(1, $ledger);
        $this->assertSame('2026-01', $ledger[0]->yearMonth);
        $this->assertSame(2.0, $ledger[0]->hoursWorked);
        $this->assertSame(10.0, $ledger[0]->retainerHours);
        $this->assertSame(8.0, $ledger[0]->closing->unusedHours);
    }

    public function test_ledger_row_belongs_to_cycle_through_respects_cycle_owner_and_period_end(): void
    {
        $builder = new InvoiceLedgerBuilder;
        $cycleMonthStart = Carbon::parse('2026-02-01');
        $periodMonthEnd = Carbon::parse('2026-03-01');

        $this->assertTrue($builder->ledgerRowBelongsToCycleThrough(
            $this->summary('2026-03', '2026-02-01'),
            '2026-02-01',
            $cycleMonthStart,
            $periodMonthEnd,
        ));
        $this->assertFalse($builder->ledgerRowBelongsToCycleThrough(
            $this->summary('2026-04', '2026-02-01'),
            '2026-02-01',
            $cycleMonthStart,
            $periodMonthEnd,
        ));
        $this->assertTrue($builder->ledgerRowBelongsToCycleThrough(
            $this->summary('2026-03'),
            '2026-02-01',
            $cycleMonthStart,
            $periodMonthEnd,
        ));
    }

    public function test_find_ledger_month_prefers_matching_cycle_start(): void
    {
        $first = $this->summary('2026-03', '2026-02-01');
        $second = $this->summary('2026-03', '2026-03-01');

        $builder = new InvoiceLedgerBuilder;

        $this->assertSame($second, $builder->findLedgerMonth([$first, $second], '2026-03', '2026-03-01'));
        $this->assertSame($first, $builder->findLedgerMonth([$first, $second], '2026-03'));
        $this->assertNull($builder->findLedgerMonth([$first, $second], '2026-04'));
    }

    private function summary(string $yearMonth, ?string $cycleStart = null): MonthSummary
    {
        return new MonthSummary(
            opening: new OpeningBalance(
                retainerHours: 0.0,
                rolloverHours: 0.0,
                expiredHours: 0.0,
                totalAvailable: 0.0,
                negativeOffset: 0.0,
                invoicedNegativeBalance: 0.0,
                effectiveRetainerHours: 0.0,
                remainingNegativeBalance: 0.0,
            ),
            closing: new ClosingBalance(
                hoursUsedFromRetainer: 0.0,
                hoursUsedFromRollover: 0.0,
                unusedHours: 0.0,
                excessHours: 0.0,
                negativeBalance: 0.0,
                remainingRollover: 0.0,
            ),
            hoursWorked: 0.0,
            yearMonth: $yearMonth,
            retainerHours: 0.0,
            cycleStart: $cycleStart,
        );
    }
}
