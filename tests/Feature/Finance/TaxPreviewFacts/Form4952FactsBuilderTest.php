<?php

namespace Tests\Feature\Finance\TaxPreviewFacts;

use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\DocumentIngestionService;
use App\Services\Finance\TaxPreviewFacts\Builders\Form4952FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleBFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleDFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleDFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Form4952FactsBuilderTest extends TestCase
{
    use RefreshDatabase;

    public function test_situation_1_trader_fund_only_carries_entirely_to_schedule_e(): void
    {
        // Rev. Rul. 2008-38, Situation 1: trader-partnership interest 200, NII 150 → 150
        // deductible (all above-the-line on Schedule E), 50 carryforward.
        $traderFund = $this->traderFundK1('Trader Fund', interestIncome: '150', box13HInterest: '200');

        $facts = $this->build([$traderFund]);

        $this->assertSame(200.0, $facts->totalInvestmentInterestExpense);
        $this->assertSame(150.0, $facts->netInvestmentIncomeBeforeQualifiedDividendElection);
        $this->assertSame(150.0, $facts->deductibleInvestmentInterestExpense);
        $this->assertSame(50.0, $facts->disallowedCarryforward);

        $this->assertSame(150.0, $facts->deductibleScheduleEAboveLine);
        $this->assertSame(0.0, $facts->deductibleScheduleAItemized);
        $this->assertSame(50.0, $facts->carryforwardScheduleE);
        $this->assertSame(0.0, $facts->carryforwardScheduleA);

        $destinations = collect($facts->carryDestinations)->keyBy('destination');
        $this->assertTrue($destinations->has('sch-e'));
        $this->assertFalse($destinations->has('sch-a'));
        $this->assertSame(150.0, $destinations['sch-e']->allowedDeduction);
    }

    public function test_situation_2_mixed_interest_is_split_pro_rata(): void
    {
        // Rev. Rul. 2008-38, Situation 2: trader-partnership 200 + investor margin 100 = 300,
        // NII 150 → allowed 150 split 2/3 (Sch E 100) and 1/3 (Sch A 50); carryforward 150 split
        // 100 (Sch E) / 50 (Sch A).
        $traderFund = $this->traderFundK1('Trader Fund', interestIncome: '150', box13HInterest: '200');

        $facts = $this->build([$traderFund], marginInterestSources: [
            new TaxFactSource(
                id: 'margin-1',
                label: 'Brokerage margin interest',
                amount: -100.0,
                sourceType: TaxFactSourceType::BrokerageMarginInterest,
                routing: TaxFactRouting::Form4952Line1,
            ),
        ]);

        $this->assertSame(300.0, $facts->totalInvestmentInterestExpense);
        $this->assertSame(150.0, $facts->deductibleInvestmentInterestExpense);
        $this->assertSame(150.0, $facts->disallowedCarryforward);

        $this->assertSame(100.0, $facts->deductibleScheduleEAboveLine);
        $this->assertSame(50.0, $facts->deductibleScheduleAItemized);
        $this->assertSame(100.0, $facts->carryforwardScheduleE);
        $this->assertSame(50.0, $facts->carryforwardScheduleA);

        // The split totals reconcile to the aggregate allowed deduction and carryforward.
        $this->assertSame(
            $facts->deductibleInvestmentInterestExpense,
            $facts->deductibleScheduleEAboveLine + $facts->deductibleScheduleAItemized,
        );
        $this->assertSame(
            $facts->disallowedCarryforward,
            $facts->carryforwardScheduleE + $facts->carryforwardScheduleA,
        );

        $destinations = collect($facts->carryDestinations)->keyBy('destination');
        $this->assertSame(200.0, $destinations['sch-e']->grossInterest);
        $this->assertSame(100.0, $destinations['sch-a']->grossInterest);
    }

    public function test_mixed_use_source_is_split_by_tracing_override(): void
    {
        $traderFund = $this->traderFundK1(
            'Trader Fund',
            interestIncome: '100',
            box13HInterest: '200',
            tracingSplit: ['scheduleA' => 80.0, 'scheduleE' => 120.0],
        );

        $facts = $this->build([$traderFund]);

        $this->assertSame(200.0, $facts->totalInvestmentInterestExpense);
        $this->assertSame(100.0, $facts->deductibleInvestmentInterestExpense);
        $this->assertSame(100.0, $facts->disallowedCarryforward);
        $this->assertSame('tracing', $facts->allocationMethod);

        $this->assertSame(40.0, $facts->deductibleScheduleAItemized);
        $this->assertSame(60.0, $facts->deductibleScheduleEAboveLine);
        $this->assertSame(40.0, $facts->carryforwardScheduleA);
        $this->assertSame(60.0, $facts->carryforwardScheduleE);

        $destinations = collect($facts->carryDestinations)->keyBy('destination');
        $this->assertSame(80.0, $destinations['sch-a']->grossInterest);
        $this->assertSame(120.0, $destinations['sch-e']->grossInterest);

        $this->assertCount(1, $facts->tracingSplitSources);
        $split = $facts->tracingSplitSources[0];
        $this->assertSame(200.0, $split->grossInterest);
        $this->assertSame(80.0, $split->scheduleAInterest);
        $this->assertSame(120.0, $split->scheduleEInterest);
        $this->assertSame(0.4, $split->scheduleAShare);
        $this->assertSame(0.6, $split->scheduleEShare);

        $this->assertSame(
            $facts->deductibleInvestmentInterestExpense,
            $facts->deductibleScheduleEAboveLine + $facts->deductibleScheduleAItemized,
        );
        $this->assertSame(
            $facts->disallowedCarryforward,
            $facts->carryforwardScheduleE + $facts->carryforwardScheduleA,
        );
    }

    public function test_stale_tracing_override_is_ignored_for_non_trader_k1(): void
    {
        $investorFund = $this->investorFundK1(
            'Investor Fund',
            interestIncome: '500',
            box13HInterest: '200',
            tracingSplit: ['scheduleA' => 80.0, 'scheduleE' => 120.0],
        );

        $facts = $this->build([$investorFund]);

        $this->assertSame(200.0, $facts->totalInvestmentInterestExpense);
        $this->assertSame('pro_rata', $facts->allocationMethod);
        $this->assertSame([], $facts->tracingSplitSources);
        $this->assertSame(200.0, $facts->deductibleScheduleAItemized);
        $this->assertSame(0.0, $facts->deductibleScheduleEAboveLine);

        $destinations = collect($facts->carryDestinations)->keyBy('destination');
        $this->assertSame(200.0, $destinations['sch-a']->grossInterest);
        $this->assertFalse($destinations->has('sch-e'));
    }

    public function test_investor_only_interest_carries_entirely_to_schedule_a(): void
    {
        // An ordinary investor fund (not a trader) → §163(d)(5)(A)(i) → Schedule A line 9.
        $investorFund = $this->investorFundK1('Investor Fund', interestIncome: '500', box13HInterest: '200');

        $facts = $this->build([$investorFund]);

        $this->assertSame(200.0, $facts->totalInvestmentInterestExpense);
        $this->assertSame(200.0, $facts->deductibleInvestmentInterestExpense);
        $this->assertSame(200.0, $facts->deductibleScheduleAItemized);
        $this->assertSame(0.0, $facts->deductibleScheduleEAboveLine);

        $destinations = collect($facts->carryDestinations)->keyBy('destination');
        $this->assertTrue($destinations->has('sch-a'));
        $this->assertFalse($destinations->has('sch-e'));
    }

    public function test_materially_participating_trader_fund_interest_bypasses_form_4952(): void
    {
        $traderFund = $this->traderFundK1('Trader Fund', interestIncome: '25', box13HInterest: '200', materialParticipation: true);

        $facts = $this->build([$traderFund]);

        $this->assertSame(0.0, $facts->totalInvestmentInterestExpense);
        $this->assertSame(0.0, $facts->deductibleInvestmentInterestExpense);
        $this->assertSame(0.0, $facts->disallowedCarryforward);
        $this->assertSame(0.0, $facts->deductibleScheduleEAboveLine);
        $this->assertSame(0.0, $facts->carryforwardScheduleE);
        $this->assertSame([], $facts->investmentInterestSources);
        $this->assertSame([], $facts->carryDestinations);

        $this->assertSame(200.0, $facts->totalMaterialParticipationScheduleEInterest);
        $this->assertCount(1, $facts->materialParticipationScheduleEInterestSources);
        $source = $facts->materialParticipationScheduleEInterestSources[0];
        $this->assertSame(-200.0, $source->amount);
        $this->assertSame(TaxFactRouting::ScheduleELine28->value, $source->routing);
        $this->assertSame(TaxFactSourceType::K1MaterialParticipationTraderInterest->value, $source->sourceType);
    }

    public function test_exposes_navigable_line_4a_k1_sources_summing_to_the_total(): void
    {
        $investorFund = $this->investorFundK1('Investor Fund', interestIncome: '500', box13HInterest: '0');

        $facts = $this->build([$investorFund]);

        $this->assertNotEmpty($facts->grossInvestmentIncomeFromK1Sources);
        $sourceTotal = collect($facts->grossInvestmentIncomeFromK1Sources)->sum(fn (TaxFactSource $source): float => $source->amount);
        $this->assertSame($facts->grossInvestmentIncomeFromK1, $sourceTotal);
        $this->assertNotNull($facts->grossInvestmentIncomeFromK1Sources[0]->taxDocumentId);
    }

    public function test_line_4d_includes_trader_fund_disposition_gain_split_into_4e_and_4f(): void
    {
        // For a non-materially-participating partner the fund's trading gains ARE property held
        // for investment (§163(d)(5)(A)(ii)), so they feed line 4d. The long-term slice (300) goes
        // to line 4e (excluded from NII unless elected); the short-term slice (100) goes to line 4f
        // and DOES raise net investment income — here unlocking the full interest deduction.
        $traderFund = $this->traderFundK1('Trader Fund', interestIncome: '150', box13HInterest: '200', shortTermGain: '100', longTermGain: '300');
        $scheduleD = $this->buildScheduleD([$traderFund]);

        $facts = $this->build([$traderFund], scheduleD: $scheduleD);

        $this->assertSame(400.0, $scheduleD->line16Combined);
        $this->assertSame(400.0, $facts->line4dNetGainFromDisposition);
        $this->assertSame(300.0, $facts->line4eNetCapitalGainFromDisposition);
        $this->assertSame(100.0, $facts->line4fNetShortTermFromDisposition);
        $this->assertSame(400.0, collect($facts->line4dCalculationRows)
            ->firstWhere('label', 'Schedule D line 16 combined gain or loss')
            ->amount);
        $this->assertSame(300.0, collect($facts->line4eCalculationRows)
            ->firstWhere('label', 'Line 4e net capital gain from disposition')
            ->amount);
        $this->assertSame(250.0, $facts->line4hTotalInvestmentIncome); // 4c (150) + 4f (100)
        $this->assertSame(250.0, $facts->line6NetInvestmentIncome);
        $this->assertSame(200.0, $facts->deductibleInvestmentInterestExpense);
        $this->assertSame(0.0, $facts->disallowedCarryforward);
    }

    public function test_line_4d_is_zero_when_investment_dispositions_net_to_a_loss(): void
    {
        $traderFund = $this->traderFundK1('Trader Fund', interestIncome: '150', box13HInterest: '200', shortTermGain: '-500', longTermGain: '100');
        $scheduleD = $this->buildScheduleD([$traderFund]);

        $facts = $this->build([$traderFund], scheduleD: $scheduleD);

        $this->assertSame(-400.0, $scheduleD->line16Combined);
        $this->assertSame(0.0, $facts->line4dNetGainFromDisposition);
        $this->assertSame(0.0, $facts->line4eNetCapitalGainFromDisposition);
        $this->assertSame(0.0, $facts->line4fNetShortTermFromDisposition);
        $this->assertSame(-400.0, collect($facts->line4dCalculationRows)
            ->firstWhere('label', 'Schedule D line 16 combined gain or loss')
            ->amount);
        $this->assertSame(0.0, collect($facts->line4dCalculationRows)
            ->firstWhere('label', 'Line 4d net gain after zero floor')
            ->amount);
        $this->assertSame(150.0, $facts->line6NetInvestmentIncome); // unchanged (= line 4c)
        $this->assertSame(150.0, $facts->deductibleInvestmentInterestExpense);
        $this->assertSame(50.0, $facts->disallowedCarryforward);
    }

    public function test_special_election_smart_worksheet_computes_lines_a_through_d(): void
    {
        // Box 20A investment income 200, Box 6b qualified dividends 150 → line 4a 200, 4b 150,
        // 4c 50. Interest 500 ≫ NII-without-election 50, so the §163(d)(4)(B)(iii) election is
        // beneficial up to the qualified dividends available: A=50, B=450, C=150, D=min(B,C)=150.
        $fund = $this->electionFundK1('Election Fund', box20AInvestmentIncome: '200', box6bQualifiedDividends: '150', box13HInterest: '500');

        $facts = $this->build([$fund]);

        $this->assertSame(150.0, $facts->totalQualifiedDividends);
        $this->assertSame(50.0, $facts->line4cNetInvestmentIncomeAfterQualifiedDividends);
        $this->assertSame(200.0, collect($facts->line4aCalculationRows)
            ->firstWhere('label', 'Line 4a gross investment income')
            ->amount);
        $this->assertSame(50.0, collect($facts->line4cCalculationRows)
            ->firstWhere('label', 'Line 4c income after qualified dividends')
            ->amount);
        $this->assertSame(50.0, $facts->electionNiiWithoutElection);
        $this->assertSame(450.0, $facts->electionExcessInvestmentInterest);
        $this->assertSame(150.0, $facts->electionAvailableForElection);
        $this->assertSame(150.0, $facts->electionMaxBeneficial);
        $this->assertSame(150.0, $facts->recommendedElection);
        // The engine reports the recommendation but does not auto-apply it (line 4g stays 0).
        $this->assertSame(0.0, $facts->line4gElectedQualifiedDividendsAndGain);
    }

    public function test_amt_form_4952_equals_regular_tax_without_amt_adjustments(): void
    {
        $traderFund = $this->traderFundK1('Trader Fund', interestIncome: '150', box13HInterest: '200');

        $facts = $this->build([$traderFund]);

        $this->assertNotNull($facts->amt);
        $this->assertSame($facts->deductibleInvestmentInterestExpense, $facts->amt->line8DeductibleInvestmentInterest);
        $this->assertSame($facts->line4dNetGainFromDisposition, $facts->amt->line4dNetGainFromDisposition);
        $this->assertSame(0.0, $facts->amt->line2cAdjustment);
    }

    public function test_amt_disposition_adjustment_flows_to_amt_line_4d(): void
    {
        // K-1 Box 17B (AMT adjustment for gain/loss on disposition, §56(a)(6)) raises the AMT net
        // gain from disposition even though regular-tax line 4d is 0 (no Schedule D gain wired in).
        $traderFund = $this->traderFundK1('Trader Fund', interestIncome: '150', box13HInterest: '200', box17BAmtAdjustment: '400');

        $facts = $this->build([$traderFund]);

        $this->assertSame(0.0, $facts->line4dNetGainFromDisposition);
        $this->assertNotNull($facts->amt);
        $this->assertSame(400.0, $facts->amt->line4dNetGainFromDisposition);
    }

    public function test_line_5_investment_expenses_follow_the_tcja_suspension_window(): void
    {
        $traderFund = $this->traderFundK1(
            'Trader Fund',
            interestIncome: '200',
            box13HInterest: '50',
            box20BInvestmentExpense: '75',
        );

        $suspended = $this->build([$traderFund], year: 2025);
        $this->assertSame(0.0, $suspended->line5InvestmentExpenses);
        $this->assertTrue($suspended->line5TcjaSuspended);
        $this->assertStringContainsString('67(g)', $suspended->line5SuspensionReason);
        $this->assertSame(0.0, $suspended->totalInvestmentExpenses);
        $this->assertSame(75.0, $suspended->totalExcludedInvestmentExpenses);
        $this->assertSame([], $suspended->investmentExpenseSources);
        $this->assertCount(1, $suspended->excludedInvestmentExpenseSources);
        $this->assertSame(-75.0, $suspended->excludedInvestmentExpenseSources[0]->amount);
        $this->assertSame(TaxFactRouting::ExcludedForm4952Line5->value, $suspended->excludedInvestmentExpenseSources[0]->routing);
        $this->assertSame(TaxFactSourceType::K1ExcludedInvestmentExpense->value, $suspended->excludedInvestmentExpenseSources[0]->sourceType);

        $active = $this->build([$traderFund], year: 2026);
        $this->assertFalse($active->line5TcjaSuspended);
        $this->assertSame(75.0, $active->line5InvestmentExpenses);
        $this->assertSame(75.0, $active->totalInvestmentExpenses);
        $this->assertSame(0.0, $active->totalExcludedInvestmentExpenses);
        $this->assertSame([], $active->excludedInvestmentExpenseSources);
        $this->assertSame(125.0, $active->line6NetInvestmentIncome);
        $this->assertCount(1, $active->investmentExpenseSources);
        $this->assertSame(-75.0, $active->investmentExpenseSources[0]->amount);
        $this->assertSame(TaxFactRouting::Form4952Line5->value, $active->investmentExpenseSources[0]->routing);
        $this->assertSame(TaxFactSourceType::K1InvestmentExpense->value, $active->investmentExpenseSources[0]->sourceType);
        $this->assertSame($traderFund->id, $active->investmentExpenseSources[0]->taxDocumentId);
        $this->assertSame('20', $active->investmentExpenseSources[0]->box);
        $this->assertSame('B', $active->investmentExpenseSources[0]->code);
    }

    public function test_allocation_worksheet_lines_18_to_20_reconcile(): void
    {
        $traderFund = $this->traderFundK1('Trader Fund', interestIncome: '150', box13HInterest: '200');
        $facts = $this->build([$traderFund], marginInterestSources: [
            new TaxFactSource(
                id: 'margin-1',
                label: 'Brokerage margin interest',
                amount: -100.0,
                sourceType: TaxFactSourceType::BrokerageMarginInterest,
                routing: TaxFactRouting::Form4952Line1,
            ),
        ]);

        $this->assertSame($facts->deductibleInvestmentInterestExpense, $facts->line18AllowedDeduction);
        $this->assertSame($facts->deductibleScheduleEAboveLine, $facts->line19aScheduleEPassthru);
        $this->assertSame($facts->deductibleScheduleAItemized, $facts->line20ScheduleAItemized);
        $this->assertSame($facts->line18AllowedDeduction, $facts->line19aScheduleEPassthru + $facts->line20ScheduleAItemized);
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  TaxFactSource[]  $marginInterestSources
     */
    private function build(array $k1Docs, array $marginInterestSources = [], ?ScheduleDFacts $scheduleD = null, int $year = 2025): Form4952Facts
    {
        $scheduleB = app(ScheduleBFactsBuilder::class)->build($k1Docs, []);

        return app(Form4952FactsBuilder::class)->build($k1Docs, [], $scheduleB, $scheduleD, null, $year, 0.0, $marginInterestSources);
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     */
    private function buildScheduleD(array $k1Docs): ScheduleDFacts
    {
        return app(ScheduleDFactsBuilder::class)->build($k1Docs, [], []);
    }

    /**
     * @param  array{scheduleA:float,scheduleE:float}|null  $tracingSplit
     */
    private function traderFundK1(string $name, string $interestIncome, string $box13HInterest, bool $materialParticipation = false, ?array $tracingSplit = null, ?string $shortTermGain = null, ?string $longTermGain = null, ?string $box17BAmtAdjustment = null, ?string $box20BInvestmentExpense = null): FileForTaxDocument
    {
        $sourceValueOverrides = [];
        if ($materialParticipation) {
            $sourceValueOverrides['k1:material-participation'] = [
                'value' => 'true',
                'originalValue' => null,
                'label' => 'Material participation in securities-trading activity',
            ];
        }
        if ($tracingSplit !== null) {
            $sourceValueOverrides['form4952:tracing:code:13:H'] = [
                'value' => json_encode($tracingSplit, JSON_THROW_ON_ERROR),
                'originalValue' => null,
                'label' => 'Form 4952 tracing split — Box 13H',
            ];
        }

        $fields = [
            'B' => $name,
            'partnershipPosition_traderInSecurities' => 'true',
            '5' => $interestIncome,
        ];
        if ($shortTermGain !== null) {
            $fields['8'] = $shortTermGain; // Box 8 net short-term capital gain → Schedule D line 5.
        }
        if ($longTermGain !== null) {
            $fields['9a'] = $longTermGain; // Box 9a net long-term capital gain → Schedule D line 12.
        }

        $codes = [
            '13' => [['code' => 'H', 'value' => $box13HInterest]],
        ];
        if ($box17BAmtAdjustment !== null) {
            $codes['17'] = [['code' => 'B', 'value' => $box17BAmtAdjustment]]; // AMT gain/loss adjustment.
        }
        if ($box20BInvestmentExpense !== null) {
            $codes['20'] = [['code' => 'B', 'value' => $box20BInvestmentExpense]];
        }

        return $this->createK1($fields, $codes, $sourceValueOverrides);
    }

    /**
     * A K-1 reporting investment income via Box 20A and qualified dividends in Box 6b, used to
     * exercise the §163(d)(4)(B)(iii) election worksheet (lines A–D).
     */
    private function electionFundK1(string $name, string $box20AInvestmentIncome, string $box6bQualifiedDividends, string $box13HInterest): FileForTaxDocument
    {
        return $this->createK1([
            'B' => $name,
            'partnershipPosition_traderInSecurities' => 'false',
            '6b' => $box6bQualifiedDividends,
        ], [
            '13' => [['code' => 'H', 'value' => $box13HInterest]],
            '20' => [['code' => 'A', 'value' => $box20AInvestmentIncome]],
        ]);
    }

    /**
     * @param  array{scheduleA:float,scheduleE:float}|null  $tracingSplit
     */
    private function investorFundK1(string $name, string $interestIncome, string $box13HInterest, ?array $tracingSplit = null): FileForTaxDocument
    {
        $sourceValueOverrides = [];
        if ($tracingSplit !== null) {
            $sourceValueOverrides['form4952:tracing:code:13:H'] = [
                'value' => json_encode($tracingSplit, JSON_THROW_ON_ERROR),
                'originalValue' => null,
                'label' => 'Form 4952 tracing split — Box 13H',
            ];
        }

        return $this->createK1([
            'B' => $name,
            'partnershipPosition_traderInSecurities' => 'false',
            '5' => $interestIncome,
        ], [
            '13' => [['code' => 'H', 'value' => $box13HInterest]],
        ], $sourceValueOverrides);
    }

    /**
     * @param  array<int|string, string>  $fields
     * @param  array<int|string, array<int, array<string, string>>>  $codes
     * @param  array<string, array<string, string|null>>  $sourceValueOverrides
     */
    private function createK1(array $fields, array $codes, array $sourceValueOverrides = []): FileForTaxDocument
    {
        $user = $this->createUser();
        $parsedData = [
            'schemaVersion' => '2026.1',
            'formType' => 'K-1-1065',
            'fields' => collect($fields)->map(fn (string $value): array => ['value' => $value])->all(),
            'codes' => $codes,
            'warnings' => [],
        ];
        if ($sourceValueOverrides !== []) {
            $parsedData['sourceValueOverrides'] = $sourceValueOverrides;
        }

        return app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => 'k1',
            'is_reviewed' => true,
            'original_filename' => 'k1.pdf',
            'stored_filename' => 'k1.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $user->id,
            'parsed_data' => $parsedData,
        ]);
    }
}
