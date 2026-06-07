<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form4952Facts
{
    /**
     * @var TaxFactSource[]
     */
    public array $investmentInterestSources;

    /**
     * @var TaxFactSource[]
     */
    public array $investmentExpenseSources;

    /**
     * @var TaxFactSource[]
     */
    public array $excludedInvestmentExpenseSources;

    /**
     * @var TaxFactSource[]
     */
    public array $materialParticipationScheduleEInterestSources;

    /**
     * @var TaxFactSource[]
     */
    public array $grossInvestmentIncomeFromK1Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $qualifiedDividendSources;

    /**
     * @var Form4952CarryDestination[]
     */
    public array $carryDestinations;

    /**
     * @var Form4952TracingSplit[]
     */
    public array $tracingSplitSources;

    /**
     * @param  TaxFactSource[]  $investmentInterestSources
     * @param  TaxFactSource[]  $investmentExpenseSources
     * @param  TaxFactSource[]  $excludedInvestmentExpenseSources
     * @param  TaxFactSource[]  $materialParticipationScheduleEInterestSources
     * @param  TaxFactSource[]  $grossInvestmentIncomeFromK1Sources
     * @param  TaxFactSource[]  $qualifiedDividendSources
     * @param  Form4952CarryDestination[]  $carryDestinations
     * @param  Form4952TracingSplit[]  $tracingSplitSources
     */
    public function __construct(
        array $investmentInterestSources,
        public float $totalInvestmentInterestExpense,
        array $investmentExpenseSources,
        public float $totalInvestmentExpenses,
        array $excludedInvestmentExpenseSources,
        public float $totalExcludedInvestmentExpenses,
        array $materialParticipationScheduleEInterestSources,
        public float $totalMaterialParticipationScheduleEInterest,
        public float $grossInvestmentIncomeFromScheduleB,
        public float $grossInvestmentIncomeFromK1,
        public float $grossInvestmentIncomeTotal,
        public float $line4cNetInvestmentIncomeAfterQualifiedDividends,
        public float $netInvestmentIncomeBeforeQualifiedDividendElection,
        public float $totalQualifiedDividends,
        public float $deductibleInvestmentInterestExpense,
        public float $disallowedCarryforward,
        array $grossInvestmentIncomeFromK1Sources,
        array $qualifiedDividendSources,
        public float $deductibleScheduleEAboveLine,
        public float $deductibleScheduleAItemized,
        public float $carryforwardScheduleE,
        public float $carryforwardScheduleA,
        array $carryDestinations,
        public string $allocationMethod = 'pro_rata',
        public string $allocationMethodDescription = 'Pro-rata allocation under Rev. Rul. 2008-38.',
        array $tracingSplitSources = [],
        // Part II lines 4d–4h: net gain from the disposition of property held for investment
        // and the §163(d)(4)(B)(iii) election. Default 0 when no Schedule D gain feeds in.
        public float $line4dNetGainFromDisposition = 0.0,
        public float $line4eNetCapitalGainFromDisposition = 0.0,
        public float $line4fNetShortTermFromDisposition = 0.0,
        public float $line4gElectedQualifiedDividendsAndGain = 0.0,
        public float $line4hTotalInvestmentIncome = 0.0,
        // Line 5 investment expenses (§212) — $0 for individuals 2018–2025 under §67(g)/TCJA.
        public float $line5InvestmentExpenses = 0.0,
        public bool $line5TcjaSuspended = true,
        public string $line5SuspensionReason = '',
        public float $line6NetInvestmentIncome = 0.0,
        // Special Election Smart Worksheet (official Form 4952 line 4g worksheet), lines A–D.
        public float $electionNiiWithoutElection = 0.0,
        public float $electionExcessInvestmentInterest = 0.0,
        public float $electionAvailableForElection = 0.0,
        public float $electionMaxBeneficial = 0.0,
        public float $recommendedElection = 0.0,
        // Allocation of Investment Interest Expense worksheet (lines 18–20).
        public float $line18AllowedDeduction = 0.0,
        public float $line19aScheduleEPassthru = 0.0,
        public float $line20ScheduleAItemized = 0.0,
        // Parallel AMT Form 4952 (null only for legacy/empty construction).
        public ?Form4952AmtFacts $amt = null,
    ) {
        $this->investmentInterestSources = $investmentInterestSources;
        $this->investmentExpenseSources = $investmentExpenseSources;
        $this->excludedInvestmentExpenseSources = $excludedInvestmentExpenseSources;
        $this->materialParticipationScheduleEInterestSources = $materialParticipationScheduleEInterestSources;
        $this->grossInvestmentIncomeFromK1Sources = $grossInvestmentIncomeFromK1Sources;
        $this->qualifiedDividendSources = $qualifiedDividendSources;
        $this->carryDestinations = $carryDestinations;
        $this->tracingSplitSources = $tracingSplitSources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'investmentInterestSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->investmentInterestSources),
            'totalInvestmentInterestExpense' => $this->totalInvestmentInterestExpense,
            'investmentExpenseSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->investmentExpenseSources),
            'totalInvestmentExpenses' => $this->totalInvestmentExpenses,
            'excludedInvestmentExpenseSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->excludedInvestmentExpenseSources),
            'totalExcludedInvestmentExpenses' => $this->totalExcludedInvestmentExpenses,
            'materialParticipationScheduleEInterestSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->materialParticipationScheduleEInterestSources),
            'totalMaterialParticipationScheduleEInterest' => $this->totalMaterialParticipationScheduleEInterest,
            'grossInvestmentIncomeFromScheduleB' => $this->grossInvestmentIncomeFromScheduleB,
            'grossInvestmentIncomeFromK1' => $this->grossInvestmentIncomeFromK1,
            'grossInvestmentIncomeTotal' => $this->grossInvestmentIncomeTotal,
            'line4cNetInvestmentIncomeAfterQualifiedDividends' => $this->line4cNetInvestmentIncomeAfterQualifiedDividends,
            'netInvestmentIncomeBeforeQualifiedDividendElection' => $this->netInvestmentIncomeBeforeQualifiedDividendElection,
            'totalQualifiedDividends' => $this->totalQualifiedDividends,
            'deductibleInvestmentInterestExpense' => $this->deductibleInvestmentInterestExpense,
            'disallowedCarryforward' => $this->disallowedCarryforward,
            'grossInvestmentIncomeFromK1Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->grossInvestmentIncomeFromK1Sources),
            'qualifiedDividendSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->qualifiedDividendSources),
            'deductibleScheduleEAboveLine' => $this->deductibleScheduleEAboveLine,
            'deductibleScheduleAItemized' => $this->deductibleScheduleAItemized,
            'carryforwardScheduleE' => $this->carryforwardScheduleE,
            'carryforwardScheduleA' => $this->carryforwardScheduleA,
            'carryDestinations' => array_map(static fn (Form4952CarryDestination $destination): array => $destination->toArray(), $this->carryDestinations),
            'allocationMethod' => $this->allocationMethod,
            'allocationMethodDescription' => $this->allocationMethodDescription,
            'tracingSplitSources' => array_map(static fn (Form4952TracingSplit $source): array => $source->toArray(), $this->tracingSplitSources),
            'line4dNetGainFromDisposition' => $this->line4dNetGainFromDisposition,
            'line4eNetCapitalGainFromDisposition' => $this->line4eNetCapitalGainFromDisposition,
            'line4fNetShortTermFromDisposition' => $this->line4fNetShortTermFromDisposition,
            'line4gElectedQualifiedDividendsAndGain' => $this->line4gElectedQualifiedDividendsAndGain,
            'line4hTotalInvestmentIncome' => $this->line4hTotalInvestmentIncome,
            'line5InvestmentExpenses' => $this->line5InvestmentExpenses,
            'line5TcjaSuspended' => $this->line5TcjaSuspended,
            'line5SuspensionReason' => $this->line5SuspensionReason,
            'line6NetInvestmentIncome' => $this->line6NetInvestmentIncome,
            'electionNiiWithoutElection' => $this->electionNiiWithoutElection,
            'electionExcessInvestmentInterest' => $this->electionExcessInvestmentInterest,
            'electionAvailableForElection' => $this->electionAvailableForElection,
            'electionMaxBeneficial' => $this->electionMaxBeneficial,
            'recommendedElection' => $this->recommendedElection,
            'line18AllowedDeduction' => $this->line18AllowedDeduction,
            'line19aScheduleEPassthru' => $this->line19aScheduleEPassthru,
            'line20ScheduleAItemized' => $this->line20ScheduleAItemized,
            'amt' => $this->amt?->toArray(),
        ];
    }
}
