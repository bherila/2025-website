<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\ChargeCadence;
use App\Enums\ClientManagement\InvoiceLineType;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientAgreementRecurringItem;
use App\Models\ClientManagement\ClientCompany;
use App\Services\ClientManagement\ClientInvoicingService;
use Carbon\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class RecurringItemInvoicingTest extends TestCase
{
    private ClientCompany $company;

    private ClientInvoicingService $invoicingService;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Recurring Matrix Co',
            'slug' => 'recurring-matrix-co',
        ]);
        $this->invoicingService = app(ClientInvoicingService::class);
    }

    /**
     * @param  list<string>  $expectedDates
     */
    #[DataProvider('recurringItemMatrixProvider')]
    public function test_recurring_item_invoicing_matrix(
        BillingCadence $billingCadence,
        ChargeCadence $chargeCadence,
        Carbon $periodStart,
        Carbon $periodEnd,
        string $itemStart,
        ?int $anchorMonth,
        int $anchorDay,
        array $expectedDates,
    ): void {
        $agreement = $this->createAgreement($billingCadence, $periodStart);
        ClientAgreementRecurringItem::create([
            'client_agreement_id' => $agreement->id,
            'description' => 'Matrix item',
            'amount' => 25,
            'charge_cadence' => $chargeCadence->value,
            'anchor_month' => $anchorMonth,
            'anchor_day' => $anchorDay,
            'start_date' => $itemStart,
            'is_taxable' => false,
            'is_summarized' => false,
        ]);

        $invoice = $this->invoicingService->generateInvoice($this->company, $periodStart, $periodEnd, $agreement);
        $invoice->load('lineItems');

        $actualDates = $invoice->lineItems
            ->where('line_type', InvoiceLineType::RecurringItem->value)
            ->map(fn ($line): string => $line->line_date->toDateString())
            ->values()
            ->all();

        $this->assertSame($expectedDates, $actualDates);
    }

    /**
     * @return iterable<string, array{0: BillingCadence, 1: ChargeCadence, 2: Carbon, 3: Carbon, 4: string, 5: int|null, 6: int, 7: list<string>}>
     */
    public static function recurringItemMatrixProvider(): iterable
    {
        yield 'monthly item on monthly invoice' => [
            BillingCadence::Monthly,
            ChargeCadence::Monthly,
            Carbon::parse('2026-03-01'),
            Carbon::parse('2026-03-31'),
            '2026-01-01',
            null,
            1,
            ['2026-03-01'],
        ];

        yield 'annual item on monthly invoice in anchor month' => [
            BillingCadence::Monthly,
            ChargeCadence::Annual,
            Carbon::parse('2026-03-01'),
            Carbon::parse('2026-03-31'),
            '2026-01-01',
            3,
            1,
            ['2026-03-01'],
        ];

        yield 'monthly item on quarterly invoice' => [
            BillingCadence::Quarterly,
            ChargeCadence::Monthly,
            Carbon::parse('2026-01-01'),
            Carbon::parse('2026-03-31'),
            '2026-01-01',
            null,
            1,
            ['2026-01-01', '2026-02-01', '2026-03-01'],
        ];

        yield 'quarterly item on quarterly invoice' => [
            BillingCadence::Quarterly,
            ChargeCadence::Quarterly,
            Carbon::parse('2026-01-01'),
            Carbon::parse('2026-03-31'),
            '2026-01-01',
            1,
            1,
            ['2026-01-01'],
        ];

        yield 'annual item on quarterly invoice in anchor quarter' => [
            BillingCadence::Quarterly,
            ChargeCadence::Annual,
            Carbon::parse('2026-01-01'),
            Carbon::parse('2026-03-31'),
            '2026-01-01',
            3,
            1,
            ['2026-03-01'],
        ];

        yield 'monthly item on annual invoice' => [
            BillingCadence::Annual,
            ChargeCadence::Monthly,
            Carbon::parse('2026-01-01'),
            Carbon::parse('2026-12-31'),
            '2026-01-01',
            null,
            1,
            [
                '2026-01-01',
                '2026-02-01',
                '2026-03-01',
                '2026-04-01',
                '2026-05-01',
                '2026-06-01',
                '2026-07-01',
                '2026-08-01',
                '2026-09-01',
                '2026-10-01',
                '2026-11-01',
                '2026-12-01',
            ],
        ];

        yield 'semi annual item on annual invoice' => [
            BillingCadence::Annual,
            ChargeCadence::SemiAnnual,
            Carbon::parse('2026-01-01'),
            Carbon::parse('2026-12-31'),
            '2026-01-01',
            2,
            1,
            ['2026-02-01', '2026-08-01'],
        ];

        yield 'annual item outside quarterly agreement window produces no line' => [
            BillingCadence::Quarterly,
            ChargeCadence::Annual,
            Carbon::parse('2026-10-01'),
            Carbon::parse('2026-12-31'),
            '2026-01-01',
            3,
            1,
            [],
        ];
    }

    private function createAgreement(BillingCadence $billingCadence, Carbon $periodStart): ClientAgreement
    {
        return ClientAgreement::factory()->for($this->company)->create([
            'agreement_text' => 'Recurring matrix agreement',
            'monthly_retainer_fee' => 1000,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150,
            'active_date' => $periodStart,
            'termination_date' => null,
            'rollover_months' => 3,
            'catch_up_threshold_hours' => 1,
            'is_visible_to_client' => true,
            'billing_cadence' => $billingCadence->value,
            'bill_overage_interim' => false,
        ]);
    }
}
