<?php

namespace Tests\Feature\Finance\TaxPreviewFacts;

use App\Enums\Finance\DeductionCategory;
use App\Models\FinanceTool\UserDeduction;
use App\Models\User;
use App\Services\Finance\TaxPreviewFacts\Builders\ScheduleAFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleAFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxPreviewTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScheduleAFactsBuilderTest extends TestCase
{
    use RefreshDatabase;

    public function test_personal_property_tax_emits_line5c_total_and_sources(): void
    {
        $user = User::factory()->create();
        $deduction = UserDeduction::factory()
            ->forYear(2025)
            ->category(DeductionCategory::PersonalPropertyTax)
            ->create([
                'user_id' => $user->id,
                'description' => 'Vehicle registration tax',
                'amount' => 27.0,
            ]);

        $facts = $this->buildScheduleAFacts([$deduction]);

        $this->assertSame(27.0, $facts->personalPropertyTaxTotal);
        $this->assertCount(1, $facts->personalPropertyTaxSources);
        $this->assertSame(27.0, $facts->personalPropertyTaxSources[0]->amount);
        $this->assertSame('schedule_a_line_5c', $facts->personalPropertyTaxSources[0]->routing);
        $this->assertSame('user_deduction_personal_property_tax', $facts->personalPropertyTaxSources[0]->sourceType);
        $this->assertSame('Vehicle registration tax', $facts->personalPropertyTaxSources[0]->label);
    }

    public function test_personal_property_tax_rolls_into_salt_paid_before_cap(): void
    {
        $user = User::factory()->create();
        $deductions = [
            UserDeduction::factory()->forYear(2025)->category(DeductionCategory::StateEstTax)->create([
                'user_id' => $user->id,
                'description' => 'State estimated tax',
                'amount' => 4000.0,
            ]),
            UserDeduction::factory()->forYear(2025)->category(DeductionCategory::RealEstateTax)->create([
                'user_id' => $user->id,
                'description' => 'Property tax',
                'amount' => 2500.0,
            ]),
            UserDeduction::factory()->forYear(2025)->category(DeductionCategory::PersonalPropertyTax)->create([
                'user_id' => $user->id,
                'description' => 'Personal property tax',
                'amount' => 27.0,
            ]),
        ];

        $facts = $this->buildScheduleAFacts($deductions);

        $this->assertSame(27.0, $facts->personalPropertyTaxTotal);
        $this->assertSame(6527.0, $facts->saltPaidBeforeCap);
        // 2025 SALT cap is 40000 at $0 MAGI (above the cap floor); deduction = min(cap, paid) = paid.
        $this->assertSame(6527.0, $facts->saltDeduction);
    }

    public function test_salt_cap_still_applied_when_aggregate_exceeds_limit(): void
    {
        $user = User::factory()->create();
        $deductions = [
            UserDeduction::factory()->forYear(2024)->category(DeductionCategory::StateEstTax)->create([
                'user_id' => $user->id,
                'description' => 'State income tax',
                'amount' => 9000.0,
            ]),
            UserDeduction::factory()->forYear(2024)->category(DeductionCategory::RealEstateTax)->create([
                'user_id' => $user->id,
                'description' => 'Real estate tax',
                'amount' => 4000.0,
            ]),
            UserDeduction::factory()->forYear(2024)->category(DeductionCategory::PersonalPropertyTax)->create([
                'user_id' => $user->id,
                'description' => 'Personal property tax',
                'amount' => 27.0,
            ]),
        ];

        // 2024 is outside the OBBBA SALT phase-down table → falls back to legacy $10,000 cap.
        $facts = $this->buildScheduleAFacts($deductions, year: 2024);

        $this->assertSame(13027.0, $facts->saltPaidBeforeCap);
        $this->assertSame(10000.0, $facts->saltCap);
        $this->assertSame(10000.0, $facts->saltDeduction);
    }

    public function test_personal_property_tax_total_defaults_to_zero(): void
    {
        $facts = $this->buildScheduleAFacts([]);

        $this->assertSame(0.0, $facts->personalPropertyTaxTotal);
        $this->assertSame([], $facts->personalPropertyTaxSources);
    }

    public function test_to_array_includes_personal_property_tax_keys(): void
    {
        $user = User::factory()->create();
        $deduction = UserDeduction::factory()->forYear(2025)->category(DeductionCategory::PersonalPropertyTax)->create([
            'user_id' => $user->id,
            'description' => 'PPT',
            'amount' => 27.0,
        ]);

        $array = $this->buildScheduleAFacts([$deduction])->toArray();

        $this->assertArrayHasKey('personalPropertyTaxTotal', $array);
        $this->assertArrayHasKey('personalPropertyTaxSources', $array);
        $this->assertArrayHasKey('otherItemizedTransactions', $array);
        $this->assertSame(27.0, $array['personalPropertyTaxTotal']);
        $this->assertCount(1, $array['personalPropertyTaxSources']);
        $this->assertSame([], $array['otherItemizedTransactions']);
    }

    public function test_other_itemized_transactions_roll_into_line16_total(): void
    {
        $facts = $this->buildScheduleAFacts([], otherItemizedTransactions: [
            new TaxPreviewTransaction(
                transactionId: 123,
                date: '2025-02-01',
                description: 'Ledger fee',
                amount: 12.5,
                accountId: 9,
            ),
            new TaxPreviewTransaction(
                transactionId: 124,
                date: '2025-02-02',
                description: 'Ledger fee credit',
                amount: -2.5,
                accountId: 9,
            ),
        ]);

        $this->assertSame(10.0, $facts->otherItemizedTotal);
        $this->assertSame(10.0, $facts->totalItemizedDeductions);
        $this->assertSame([
            [
                'transactionId' => 123,
                'date' => '2025-02-01',
                'description' => 'Ledger fee',
                'amount' => 12.5,
                'accountId' => 9,
            ],
            [
                'transactionId' => 124,
                'date' => '2025-02-02',
                'description' => 'Ledger fee credit',
                'amount' => -2.5,
                'accountId' => 9,
            ],
        ], $facts->toArray()['otherItemizedTransactions']);
    }

    /**
     * @param  UserDeduction[]  $userDeductions
     * @param  TaxPreviewTransaction[]  $otherItemizedTransactions
     */
    private function buildScheduleAFacts(array $userDeductions, int $year = 2025, array $otherItemizedTransactions = []): ScheduleAFacts
    {
        return app(ScheduleAFactsBuilder::class)->build(
            k1Docs: [],
            w2Docs: [],
            userDeductions: $userDeductions,
            form4952: $this->emptyForm4952Facts(),
            year: $year,
            otherItemizedTransactions: $otherItemizedTransactions,
        );
    }

    private function emptyForm4952Facts(): Form4952Facts
    {
        return new Form4952Facts(
            investmentInterestSources: [],
            totalInvestmentInterestExpense: 0.0,
            investmentExpenseSources: [],
            totalInvestmentExpenses: 0.0,
            excludedInvestmentExpenseSources: [],
            totalExcludedInvestmentExpenses: 0.0,
            materialParticipationScheduleEInterestSources: [],
            totalMaterialParticipationScheduleEInterest: 0.0,
            grossInvestmentIncomeFromScheduleB: 0.0,
            grossInvestmentIncomeFromK1: 0.0,
            grossInvestmentIncomeTotal: 0.0,
            line4cNetInvestmentIncomeAfterQualifiedDividends: 0.0,
            netInvestmentIncomeBeforeQualifiedDividendElection: 0.0,
            totalQualifiedDividends: 0.0,
            deductibleInvestmentInterestExpense: 0.0,
            disallowedCarryforward: 0.0,
            grossInvestmentIncomeFromK1Sources: [],
            qualifiedDividendSources: [],
            deductibleScheduleEAboveLine: 0.0,
            deductibleScheduleAItemized: 0.0,
            carryforwardScheduleE: 0.0,
            carryforwardScheduleA: 0.0,
            carryDestinations: [],
        );
    }
}
