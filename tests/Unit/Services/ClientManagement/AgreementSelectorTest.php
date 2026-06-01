<?php

namespace Tests\Unit\Services\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Services\ClientManagement\AgreementSelector;
use Carbon\Carbon;
use Tests\TestCase;

class AgreementSelectorTest extends TestCase
{
    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_agreement_for_invoice_generation_falls_back_to_recent_terminated_agreement(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15'));

        $company = ClientCompany::factory()->create();
        ClientAgreement::factory()->for($company)->create([
            'active_date' => '2024-01-01',
            'termination_date' => '2024-03-31',
        ]);
        $recentAgreement = ClientAgreement::factory()->for($company)->create([
            'active_date' => '2024-04-01',
            'termination_date' => '2024-05-31',
        ]);

        $selectedAgreement = (new AgreementSelector)->agreementForInvoiceGeneration($company);

        $this->assertSame($recentAgreement->id, $selectedAgreement->id);
    }

    public function test_agreements_for_invoice_generation_includes_future_non_monthly_agreements(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15'));

        $company = ClientCompany::factory()->create();
        $currentMonthly = ClientAgreement::factory()->for($company)->create([
            'active_date' => '2026-05-01',
            'billing_cadence' => BillingCadence::Monthly->value,
        ]);
        $futureQuarterly = ClientAgreement::factory()->for($company)->create([
            'active_date' => '2026-07-01',
            'billing_cadence' => BillingCadence::Quarterly->value,
        ]);
        ClientAgreement::factory()->for($company)->create([
            'active_date' => '2026-07-01',
            'billing_cadence' => BillingCadence::Monthly->value,
        ]);

        $agreements = (new AgreementSelector)->agreementsForInvoiceGeneration($company);

        $this->assertSame(
            [$currentMonthly->id, $futureQuarterly->id],
            $agreements->pluck('id')->all()
        );
    }

    public function test_successor_agreement_for_generation_orders_by_active_date_then_id(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15'));

        $company = ClientCompany::factory()->create();
        $firstAgreement = ClientAgreement::factory()->for($company)->create([
            'active_date' => '2026-01-01',
        ]);
        $sameDateSuccessor = ClientAgreement::factory()->for($company)->create([
            'active_date' => '2026-01-01',
        ]);
        $laterAgreement = ClientAgreement::factory()->for($company)->create([
            'active_date' => '2026-03-01',
        ]);

        $selector = new AgreementSelector;
        $agreements = $selector->agreementsForInvoiceGeneration($company);

        $this->assertSame(
            $sameDateSuccessor->id,
            $selector->successorAgreementForGeneration($agreements, $firstAgreement)?->id
        );
        $this->assertSame(
            $laterAgreement->id,
            $selector->successorAgreementForGeneration($agreements, $sameDateSuccessor)?->id
        );
    }

    public function test_agreement_covering_date_returns_latest_matching_segment(): void
    {
        $company = ClientCompany::factory()->create();
        $olderAgreement = ClientAgreement::factory()->for($company)->create([
            'active_date' => '2026-01-01',
            'termination_date' => '2026-03-31',
        ]);
        $newerAgreement = ClientAgreement::factory()->for($company)->create([
            'active_date' => '2026-02-01',
            'termination_date' => null,
        ]);

        $selector = new AgreementSelector;

        $this->assertSame(
            $newerAgreement->id,
            $selector->agreementCoveringDate($company, Carbon::parse('2026-02-15'))?->id
        );
        $this->assertSame(
            $olderAgreement->id,
            $selector->agreementCoveringDate($company, Carbon::parse('2026-01-15'))?->id
        );
        $this->assertNull($selector->agreementCoveringDate($company, Carbon::parse('2025-12-31')));
    }
}
