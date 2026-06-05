<?php

namespace Tests\Feature\Finance\TaxPreviewFacts;

use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\DocumentIngestionService;
use App\Services\Finance\TaxPreviewFacts\Builders\Form4952FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\Schedule1FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleBFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Schedule1Facts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Schedule1FactsBuilderTest extends TestCase
{
    use RefreshDatabase;

    public function test_allowed_trader_fund_investment_interest_reduces_schedule_1_line_5(): void
    {
        // Trader-fund K-1 with $1,000 ordinary income (Box 1) and $200 §163(d)(5)(A)(ii)
        // trader-fund interest, $150 of which is allowed above-the-line on Schedule E line 28.
        // Schedule 1 line 5 must net the K-1 income against the allowed deduction (1000 - 150 = 850)
        // so the benefit reaches Form 1040 line 8 / AGI — not just the Schedule E preview.
        $traderFund = $this->traderFundK1('Trader Fund', ordinaryIncome: '1000', interestIncome: '150', box13HInterest: '200');

        $form4952 = $this->buildForm4952([$traderFund]);
        $this->assertSame(150.0, $form4952->deductibleScheduleEAboveLine);

        $facts = $this->buildSchedule1([$traderFund], $form4952);

        $deductionSource = collect($facts->line5Sources)
            ->firstWhere('id', 'form4952-schedule1-line5-investment-interest');
        $this->assertNotNull($deductionSource);
        $this->assertSame(-150.0, $deductionSource->amount);
        $this->assertSame(TaxFactRouting::Schedule1Line5->value, $deductionSource->routing);
        $this->assertSame(TaxFactSourceType::Form4952ScheduleEInvestmentInterest->value, $deductionSource->sourceType);

        $this->assertSame(850.0, $facts->line5Total);
    }

    public function test_no_deduction_source_when_nothing_is_allowed_above_the_line(): void
    {
        // Ordinary investor fund: the allowed interest itemizes on Schedule A, nothing above-the-line,
        // so Schedule 1 line 5 carries only the K-1 income with no negative interest source.
        $investorFund = $this->investorFundK1('Investor Fund', ordinaryIncome: '1000', interestIncome: '500', box13HInterest: '200');

        $form4952 = $this->buildForm4952([$investorFund]);
        $this->assertSame(0.0, $form4952->deductibleScheduleEAboveLine);

        $facts = $this->buildSchedule1([$investorFund], $form4952);

        $this->assertNull(
            collect($facts->line5Sources)->firstWhere('id', 'form4952-schedule1-line5-investment-interest'),
        );
        $this->assertSame(1000.0, $facts->line5Total);
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     */
    private function buildForm4952(array $k1Docs): Form4952Facts
    {
        $scheduleB = app(ScheduleBFactsBuilder::class)->build($k1Docs, []);

        return app(Form4952FactsBuilder::class)->build($k1Docs, [], $scheduleB, 0.0, []);
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     */
    private function buildSchedule1(array $k1Docs, Form4952Facts $form4952): Schedule1Facts
    {
        return app(Schedule1FactsBuilder::class)->build($k1Docs, [], null, null, null, null, $form4952);
    }

    private function traderFundK1(string $name, string $ordinaryIncome, string $interestIncome, string $box13HInterest): FileForTaxDocument
    {
        return $this->createK1([
            'B' => $name,
            'partnershipPosition_traderInSecurities' => 'true',
            '1' => $ordinaryIncome,
            '5' => $interestIncome,
        ], [
            '13' => [['code' => 'H', 'value' => $box13HInterest]],
        ]);
    }

    private function investorFundK1(string $name, string $ordinaryIncome, string $interestIncome, string $box13HInterest): FileForTaxDocument
    {
        return $this->createK1([
            'B' => $name,
            'partnershipPosition_traderInSecurities' => 'false',
            '1' => $ordinaryIncome,
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
