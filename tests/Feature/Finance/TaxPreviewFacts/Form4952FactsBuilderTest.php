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

    private function traderFundK1(string $name, string $interestIncome, string $box13HInterest): FileForTaxDocument
    {
        return $this->createK1([
            'B' => $name,
            'partnershipPosition_traderInSecurities' => 'true',
            '5' => $interestIncome,
        ], [
            '13' => [['code' => 'H', 'value' => $box13HInterest]],
        ]);
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
     */
    private function createK1(array $fields, array $codes): FileForTaxDocument
    {
        $user = $this->createUser();

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
            'parsed_data' => [
                'schemaVersion' => '2026.1',
                'formType' => 'K-1-1065',
                'fields' => collect($fields)->map(fn (string $value): array => ['value' => $value])->all(),
                'codes' => $codes,
                'warnings' => [],
            ],
        ]);
    }
}
