<?php

namespace Tests\Feature\Finance\TaxPreviewFacts;

use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\DocumentIngestionService;
use App\Services\Finance\TaxPreviewFacts\Builders\Form4952FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleBFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952Facts;
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

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  TaxFactSource[]  $marginInterestSources
     */
    private function build(array $k1Docs, array $marginInterestSources = []): Form4952Facts
    {
        $scheduleB = app(ScheduleBFactsBuilder::class)->build($k1Docs, []);

        return app(Form4952FactsBuilder::class)->build($k1Docs, [], $scheduleB, 0.0, $marginInterestSources);
    }

    /**
     * @param  array{scheduleA:float,scheduleE:float}|null  $tracingSplit
     */
    private function traderFundK1(string $name, string $interestIncome, string $box13HInterest, bool $materialParticipation = false, ?array $tracingSplit = null): FileForTaxDocument
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

        return $this->createK1([
            'B' => $name,
            'partnershipPosition_traderInSecurities' => 'true',
            '5' => $interestIncome,
        ], [
            '13' => [['code' => 'H', 'value' => $box13HInterest]],
        ], $sourceValueOverrides);
    }

    private function investorFundK1(string $name, string $interestIncome, string $box13HInterest): FileForTaxDocument
    {
        return $this->createK1([
            'B' => $name,
            'partnershipPosition_traderInSecurities' => 'false',
            '5' => $interestIncome,
        ], [
            '13' => [['code' => 'H', 'value' => $box13HInterest]],
        ]);
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
