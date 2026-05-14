<?php

namespace App\Services\Planning;

use App\Services\Finance\MoneyMath;
use App\Services\Tax\PureTaxMath\FederalBrackets;
use App\Services\Tax\PureTaxMath\FilingStatus;
use App\Services\Tax\PureTaxMath\Irmaa;
use App\Services\Tax\PureTaxMath\ItemizedDeductions;
use App\Services\Tax\PureTaxMath\Niit;
use App\Services\Tax\PureTaxMath\Rmd;
use App\Services\Tax\PureTaxMath\SocialSecurity;
use App\Services\Tax\PureTaxMath\StandardDeduction;

final class RothConversionCalculator
{
    public function project(RothConversionInputs $inputs): RothConversionProjection
    {
        $scenarios = [];

        foreach ($inputs->scenarios() as $index => $scenario) {
            $scenarios[] = $this->projectScenario($inputs, $scenario, $index);
        }

        return new RothConversionProjection([
            'inputs' => $inputs->toArray(),
            'scenarios' => $scenarios,
            'warnings' => $this->projectionWarnings($scenarios),
            'reference' => [
                'rmdRates' => $this->rmdRates(),
                'socialSecurityTaxation' => $this->socialSecurityTaxationSteps($inputs->filingStatus()),
                'irmaaTiers' => Irmaa::tiersFor($inputs->int('currentYear'), $inputs->filingStatus(), $this->rate($inputs->number('assumptions.inflationPercent'))),
                'conversionWindows' => [
                    ['retirementAge' => 58, 'yearsUntilRmd73' => 15],
                    ['retirementAge' => 65, 'yearsUntilRmd73' => 8],
                    ['retirementAge' => 69, 'yearsUntilRmd73' => 4],
                ],
            ],
        ]);
    }

    /**
     * @param  array<string, mixed>  $scenario
     * @return array<string, mixed>
     */
    private function projectScenario(RothConversionInputs $inputs, array $scenario, int $index): array
    {
        $strategy = array_replace_recursive($inputs->strategy(), is_array($scenario['strategy'] ?? null) ? $scenario['strategy'] : []);
        $initialStatus = $inputs->filingStatus();
        $claimAgePrimary = isset($scenario['claimAgePrimary']) ? (int) $scenario['claimAgePrimary'] : $inputs->int('socialSecurity.claimAgePrimary');
        $claimAgeSpouse = isset($scenario['claimAgeSpouse']) ? (int) $scenario['claimAgeSpouse'] : $inputs->int('socialSecurity.claimAgeSpouse');
        $inflationRate = $this->rate($inputs->number('assumptions.inflationPercent'));
        $discountRate = $this->rate($inputs->number('assumptions.discountRatePercent'));
        $stateRate = $this->rate($inputs->number('assumptions.stateTaxPercent'));
        $currentYear = $inputs->int('currentYear');
        $startAge = $inputs->int('people.primaryCurrentAge');
        $primaryEndAge = $inputs->int('people.primaryEndAge');
        $primaryBirthYear = $inputs->int('people.primaryBirthYear');
        $spouseBirthYear = $inputs->int('people.spouseBirthYear');
        $spouseCurrentAge = $inputs->int('people.spouseCurrentAge');
        $spouseEndAge = $inputs->int('people.spouseEndAge');
        $spouseAgeOffset = $spouseCurrentAge - $startAge;
        $endAge = max($startAge, $primaryEndAge);
        if ($initialStatus->isMarriedLike()) {
            $endAge = max($endAge, $spouseEndAge - $spouseAgeOffset);
        }

        $firstDeathAge = $inputs->nullableInt('people.firstDeathAge');

        $balances = [
            'traditionalPrimary' => $this->money($inputs->number('balances.traditionalPrimary')),
            'traditionalSpouse' => $this->money($inputs->number('balances.traditionalSpouse')),
            'roth' => $this->money($inputs->number('balances.rothPrimary') + $inputs->number('balances.rothSpouse')),
            'hsa' => $this->money($inputs->number('balances.hsa')),
            'taxable' => $this->money($inputs->number('balances.taxableBrokerage')),
            'taxableBasis' => $this->money($inputs->number('balances.taxableBasis')),
            'cash' => $this->money($inputs->number('balances.cash')),
        ];
        if (! $initialStatus->isMarriedLike()) {
            $balances['traditionalPrimary'] = $this->money($balances['traditionalPrimary'] + $balances['traditionalSpouse']);
            $balances['traditionalSpouse'] = 0.0;
        }

        $magiHistory = [
            $currentYear - 2 => $this->money($inputs->number('assumptions.twoYearsPriorMagi')),
            $currentYear - 1 => $this->money($inputs->number('assumptions.priorYearMagi')),
        ];
        $rows = [];
        $summary = [
            'lifetimeFederalTax' => 0.0,
            'lifetimeStateTax' => 0.0,
            'lifetimeNiit' => 0.0,
            'lifetimeIrmaa' => 0.0,
            'lifetimeSocialSecurity' => 0.0,
            'lifetimeExpenses' => 0.0,
            'presentValueLifetimeTax' => 0.0,
            'presentValueSocialSecurity' => 0.0,
            'presentValueLifetimeExpenses' => 0.0,
            'finalEstateValue' => 0.0,
            'presentValueFinalEstate' => 0.0,
            'irmaaHitYears' => 0,
            'cashShortfallTaxApproximationYears' => 0,
            'unfundedCashShortfall' => 0.0,
        ];

        for ($primaryAge = $startAge; $primaryAge <= $endAge; $primaryAge++) {
            $yearIndex = $primaryAge - $startAge;
            $calendarYear = $currentYear + $yearIndex;
            $spouseAge = $primaryAge + $spouseAgeOffset;
            $status = $this->statusForAge($initialStatus, $primaryAge, $firstDeathAge);
            $spouseAlive = $initialStatus->isMarriedLike() && $this->spouseAlive($primaryAge, $spouseAge, $spouseEndAge, $firstDeathAge);
            if (! $spouseAlive && $balances['traditionalSpouse'] > 0.0) {
                $balances['traditionalPrimary'] = $this->money($balances['traditionalPrimary'] + $balances['traditionalSpouse']);
                $balances['traditionalSpouse'] = 0.0;
            }

            $growthRate = $this->growthRateForAge($inputs, $primaryAge);
            $cashYieldRate = $this->rate($inputs->number('assumptions.cashYieldPercent'));
            $balances = $this->growBalances($balances, $growthRate, $cashYieldRate);
            $beginningBalances = $this->visibleBalances($balances);

            $wagesPrimary = $primaryAge < $inputs->int('income.retirementAgePrimary')
                ? $this->inflate($inputs->number('income.wagesPrimary'), $inflationRate, $yearIndex)
                : 0.0;
            $wagesSpouse = $spouseAge < $inputs->int('income.retirementAgeSpouse') && $spouseAlive
                ? $this->inflate($inputs->number('income.wagesSpouse'), $inflationRate, $yearIndex)
                : 0.0;
            $selfEmployment = $this->inflate($inputs->number('income.selfEmploymentPrimary') + ($spouseAlive ? $inputs->number('income.selfEmploymentSpouse') : 0.0), $inflationRate, $yearIndex);
            $interest = $this->inflate($inputs->number('income.interest'), $inflationRate, $yearIndex);
            $taxExemptInterest = $this->inflate($inputs->number('income.taxExemptInterest'), $inflationRate, $yearIndex);
            $otherOrdinary = $this->inflate($inputs->number('income.otherOrdinary'), $inflationRate, $yearIndex);
            $qualifiedDividends = $this->inflate($inputs->number('income.qualifiedDividends'), $inflationRate, $yearIndex);
            $recurringLtcg = $this->inflate($inputs->number('income.longTermCapitalGains'), $inflationRate, $yearIndex);
            $expenses = $this->projectedExpenses($inputs, $inflationRate, $yearIndex);

            $rmds = $this->requiredMinimumDistributions($balances['traditionalPrimary'], $balances['traditionalSpouse'], $primaryAge, $spouseAge, $primaryBirthYear, $spouseBirthYear, $spouseAlive);
            $rmd = $rmds['total'];
            $traditionalAvailable = $this->traditionalBalance($balances);

            $grossSocialSecurity = $this->socialSecurityBenefit($inputs->number('socialSecurity.piaPrimary'), $inputs->int('socialSecurity.fraPrimary'), $claimAgePrimary, $primaryAge, $yearIndex, $inputs->number('socialSecurity.colaPercent'));
            if ($spouseAlive) {
                $grossSocialSecurity += $this->socialSecurityBenefit($inputs->number('socialSecurity.piaSpouse'), $inputs->int('socialSecurity.fraSpouse'), $claimAgeSpouse, $spouseAge, $yearIndex, $inputs->number('socialSecurity.colaPercent'));
            }

            $ordinaryBeforeConversionComponents = [
                $wagesPrimary, $wagesSpouse, $selfEmployment, $interest, $otherOrdinary, $rmd,
            ];
            $conversion = $this->rothConversionAmount(
                $inputs,
                $strategy,
                $traditionalAvailable,
                $calendarYear,
                $primaryAge,
                $status,
                $inflationRate,
                $yearIndex,
                $expenses,
                $ordinaryBeforeConversionComponents,
                $grossSocialSecurity,
                $taxExemptInterest,
                $qualifiedDividends + $recurringLtcg,
            );
            $conversion = min($conversion, max(0.0, $traditionalAvailable - $rmd));

            $balances['traditionalPrimary'] = $this->money($balances['traditionalPrimary'] - $rmds['primary']);
            $balances['traditionalSpouse'] = $this->money($balances['traditionalSpouse'] - $rmds['spouse']);
            $balances = $this->withdrawFromTraditionalBuckets($balances, $conversion);
            $balances['roth'] = $this->money($balances['roth'] + $conversion);
            $balances['cash'] = $this->money($balances['cash'] + $rmd);

            $otherIncomeForSs = MoneyMath::sum([$wagesPrimary, $wagesSpouse, $selfEmployment, $interest, $otherOrdinary, $rmd, $conversion, $qualifiedDividends, $recurringLtcg]);
            $taxableSocialSecurity = SocialSecurity::taxablePortion($status, $grossSocialSecurity, $otherIncomeForSs, $taxExemptInterest);
            $ordinaryBeforeDeduction = MoneyMath::sum([$wagesPrimary, $wagesSpouse, $selfEmployment, $interest, $otherOrdinary, $rmd, $conversion, $taxableSocialSecurity]);
            $basePreferentialIncome = MoneyMath::sum([$qualifiedDividends, $recurringLtcg]);
            $deductionForHarvest = function (float $candidateHarvest) use ($inputs, $calendarYear, $status, $inflationRate, $yearIndex, $ordinaryBeforeDeduction, $basePreferentialIncome, $taxExemptInterest, $expenses): float {
                $candidateAgi = MoneyMath::sum([$ordinaryBeforeDeduction, $basePreferentialIncome, $candidateHarvest]);
                $candidateMagi = MoneyMath::sum([$candidateAgi, $taxExemptInterest]);

                return $this->deductionBreakdown($inputs, $calendarYear, $status, $inflationRate, $yearIndex, $candidateAgi, $candidateMagi, $expenses)['deductionUsed'];
            };
            $harvestedLtcg = $this->harvestedLongTermGains($strategy, $calendarYear, $status, $ordinaryBeforeDeduction, $basePreferentialIncome, $balances, $inflationRate, $deductionForHarvest);
            $longTermGains = MoneyMath::sum([$recurringLtcg, $harvestedLtcg]);
            $preferentialIncome = MoneyMath::sum([$qualifiedDividends, $longTermGains]);
            $agi = MoneyMath::sum([$ordinaryBeforeDeduction, $preferentialIncome]);
            $magi = MoneyMath::sum([$agi, $taxExemptInterest]);
            $deductionBreakdown = $this->deductionBreakdown($inputs, $calendarYear, $status, $inflationRate, $yearIndex, $agi, $magi, $expenses);
            $deduction = $deductionBreakdown['deductionUsed'];
            $taxableIncome = $this->money(max(0.0, $agi - $deduction));
            $federalTax = FederalBrackets::taxOnCombined($calendarYear, $status, $taxableIncome, $preferentialIncome, $inflationRate);
            $niit = Niit::tax($status, $magi, MoneyMath::sum([$interest, $qualifiedDividends, $longTermGains]));
            $stateTaxBase = MoneyMath::sum([$ordinaryBeforeDeduction, $inputs->bool('assumptions.stateTaxesLtcg') ? $longTermGains : 0.0]);
            $stateTax = $this->money($stateTaxBase * $stateRate);
            $irmaaLookbackMagi = $magiHistory[$calendarYear - 2] ?? 0.0;
            $irmaaTier = Irmaa::tierFor($calendarYear, $status, $irmaaLookbackMagi, $inflationRate);
            $irmaa = $primaryAge >= 65 ? $irmaaTier->annualSurcharge() : 0.0;
            $totalTax = MoneyMath::sum([$federalTax, $niit, $stateTax, $irmaa]);

            $balances['cash'] = $this->money($balances['cash'] + $wagesPrimary + $wagesSpouse + $selfEmployment + $interest + $taxExemptInterest + $otherOrdinary + $grossSocialSecurity - $totalTax - $expenses['total']);
            $cashCover = $this->coverNegativeCash($balances);
            $balances = $cashCover['balances'];
            $cashShortfallWithdrawals = $cashCover['withdrawals'];
            $magiHistory[$calendarYear] = $magi;

            $discountFactor = $this->discountFactor($discountRate, $yearIndex);
            $estateValue = $this->estateValue($balances);
            $summary['lifetimeFederalTax'] = MoneyMath::sum([$summary['lifetimeFederalTax'], $federalTax]);
            $summary['lifetimeStateTax'] = MoneyMath::sum([$summary['lifetimeStateTax'], $stateTax]);
            $summary['lifetimeNiit'] = MoneyMath::sum([$summary['lifetimeNiit'], $niit]);
            $summary['lifetimeIrmaa'] = MoneyMath::sum([$summary['lifetimeIrmaa'], $irmaa]);
            $summary['lifetimeSocialSecurity'] = MoneyMath::sum([$summary['lifetimeSocialSecurity'], $grossSocialSecurity]);
            $summary['lifetimeExpenses'] = MoneyMath::sum([$summary['lifetimeExpenses'], $expenses['total']]);
            $summary['presentValueLifetimeTax'] = MoneyMath::sum([$summary['presentValueLifetimeTax'], $totalTax / $discountFactor]);
            $summary['presentValueSocialSecurity'] = MoneyMath::sum([$summary['presentValueSocialSecurity'], $grossSocialSecurity / $discountFactor]);
            $summary['presentValueLifetimeExpenses'] = MoneyMath::sum([$summary['presentValueLifetimeExpenses'], $expenses['total'] / $discountFactor]);
            $summary['irmaaHitYears'] += $irmaa > 0.0 ? 1 : 0;
            $summary['finalEstateValue'] = $estateValue;
            $summary['presentValueFinalEstate'] = $estateValue / $discountFactor;
            $summary['cashShortfallTaxApproximationYears'] += $cashShortfallWithdrawals['taxable'] > 0.0 || $cashShortfallWithdrawals['traditional'] > 0.0 ? 1 : 0;
            $summary['unfundedCashShortfall'] = MoneyMath::sum([$summary['unfundedCashShortfall'], $cashShortfallWithdrawals['unfunded']]);

            $rows[] = [
                'calendarYear' => $calendarYear,
                'primaryAge' => $primaryAge,
                'spouseAge' => $spouseAge,
                'filingStatus' => $status->value,
                'filingStatusLabel' => $status->label(),
                'beginningBalances' => $beginningBalances,
                'endingBalances' => $this->visibleBalances($balances),
                'ordinaryIncomeStack' => [
                    'wages' => MoneyMath::sum([$wagesPrimary, $wagesSpouse]),
                    'selfEmployment' => $selfEmployment,
                    'interest' => $interest,
                    'taxExemptInterest' => $taxExemptInterest,
                    'otherOrdinary' => $otherOrdinary,
                    'rmd' => $rmd,
                    'rmdPrimary' => $rmds['primary'],
                    'rmdSpouse' => $rmds['spouse'],
                    'rothConversion' => $conversion,
                    'taxableSocialSecurity' => $taxableSocialSecurity,
                ],
                'capitalGainStack' => [
                    'qualifiedDividends' => $qualifiedDividends,
                    'recurringLongTermGains' => $recurringLtcg,
                    'harvestedLongTermGains' => $harvestedLtcg,
                ],
                'grossSocialSecurity' => $grossSocialSecurity,
                'taxableSocialSecurity' => $taxableSocialSecurity,
                'standardOrItemizedDeduction' => $deduction,
                'deductionBreakdown' => $deductionBreakdown,
                'expenses' => $expenses,
                'agi' => $agi,
                'magi' => $magi,
                'taxableIncome' => $taxableIncome,
                'federalTax' => $federalTax,
                'stateTax' => $stateTax,
                'niit' => $niit,
                'irmaa' => $irmaa,
                'irmaaTier' => $irmaaTier->toArray(),
                'totalTax' => $totalTax,
                'rmd' => $rmd,
                'rothConversion' => $conversion,
                'cashShortfallWithdrawals' => $cashShortfallWithdrawals,
                'estateValue' => $estateValue,
            ];
        }

        return [
            'id' => 'scenario-'.($index + 1),
            'name' => (string) ($scenario['name'] ?? $strategy['name'] ?? 'Scenario '.($index + 1)),
            'strategy' => $strategy,
            'summary' => array_map(fn (float|int $value): float|int => is_float($value) ? $this->money($value) : $value, $summary),
            'years' => $rows,
            'socialSecurityBreakeven' => $this->socialSecurityBreakeven($inputs, $claimAgePrimary),
        ];
    }

    /**
     * @param  array<string, float>  $balances
     * @return array<string, float>
     */
    private function growBalances(array $balances, float $growthRate, float $cashYieldRate): array
    {
        foreach (['traditionalPrimary', 'traditionalSpouse', 'roth', 'hsa', 'taxable'] as $key) {
            $balances[$key] = $this->money($balances[$key] * (1.0 + $growthRate));
        }
        $balances['cash'] = $this->money($balances['cash'] * (1.0 + $cashYieldRate));

        return $balances;
    }

    /**
     * @return array{propertyTax: float, medicalExpense: float, otherNondeductible: float, total: float}
     */
    private function projectedExpenses(RothConversionInputs $inputs, float $inflationRate, int $yearIndex): array
    {
        $propertyTaxRate = ItemizedDeductions::propertyTaxGrowthRate($inflationRate, $inputs->bool('expenses.caProp13PropertyTaxLimit'));
        $propertyTax = $this->inflate($inputs->number('expenses.propertyTax'), $propertyTaxRate, $yearIndex);
        $medicalExpense = $this->inflate($inputs->number('expenses.medicalExpense'), $inflationRate, $yearIndex);
        $otherNondeductible = $this->inflate($inputs->number('expenses.otherNondeductible'), $inflationRate, $yearIndex);

        return [
            'propertyTax' => $propertyTax,
            'medicalExpense' => $medicalExpense,
            'otherNondeductible' => $otherNondeductible,
            'total' => MoneyMath::sum([$propertyTax, $medicalExpense, $otherNondeductible]),
        ];
    }

    /**
     * @param  array{propertyTax: float, medicalExpense: float, otherNondeductible: float, total: float}  $expenses
     * @return array{mode: string, standardDeduction: float, customDeduction: float, itemizedDeduction: float, saltCap: float, saltDeduction: float, medicalExpenseFloor: float, medicalExpenseDeduction: float, deductionUsed: float}
     */
    private function deductionBreakdown(RothConversionInputs $inputs, int $calendarYear, FilingStatus $status, float $inflationRate, int $yearIndex, float $agi, float $magi, array $expenses): array
    {
        $standardDeduction = StandardDeduction::amount($calendarYear, $status, $inflationRate);
        $customDeduction = $this->inflate($inputs->number('assumptions.customDeduction'), $inflationRate, $yearIndex);
        $saltCap = ItemizedDeductions::saltCap($calendarYear, $magi);
        $saltDeduction = ItemizedDeductions::saltDeduction($expenses['propertyTax'], $calendarYear, $magi);
        $medicalExpenseFloor = ItemizedDeductions::medicalExpenseFloor($agi);
        $medicalExpenseDeduction = ItemizedDeductions::medicalExpenseDeduction($expenses['medicalExpense'], $agi);
        $itemizedDeduction = MoneyMath::sum([$saltDeduction, $medicalExpenseDeduction]);

        if ($inputs->value('assumptions.deductionMode') === 'custom') {
            return [
                'mode' => 'custom',
                'standardDeduction' => $standardDeduction,
                'customDeduction' => $customDeduction,
                'itemizedDeduction' => $itemizedDeduction,
                'saltCap' => $saltCap,
                'saltDeduction' => $saltDeduction,
                'medicalExpenseFloor' => $medicalExpenseFloor,
                'medicalExpenseDeduction' => $medicalExpenseDeduction,
                'deductionUsed' => $customDeduction,
            ];
        }

        $usesItemized = $itemizedDeduction > $standardDeduction;

        return [
            'mode' => $usesItemized ? 'itemized' : 'standard',
            'standardDeduction' => $standardDeduction,
            'customDeduction' => $customDeduction,
            'itemizedDeduction' => $itemizedDeduction,
            'saltCap' => $saltCap,
            'saltDeduction' => $saltDeduction,
            'medicalExpenseFloor' => $medicalExpenseFloor,
            'medicalExpenseDeduction' => $medicalExpenseDeduction,
            'deductionUsed' => $usesItemized ? $itemizedDeduction : $standardDeduction,
        ];
    }

    /**
     * @param  array<string, float>  $balances
     * @return array{balances: array<string, float>, withdrawals: array{taxable: float, roth: float, traditional: float, total: float, unfunded: float}}
     */
    private function coverNegativeCash(array $balances): array
    {
        $withdrawals = [
            'taxable' => 0.0,
            'roth' => 0.0,
            'traditional' => 0.0,
            'total' => 0.0,
            'unfunded' => 0.0,
        ];

        if ($balances['cash'] >= 0.0) {
            return ['balances' => $balances, 'withdrawals' => $withdrawals];
        }

        $shortfall = abs($balances['cash']);
        foreach (['taxable', 'roth', 'traditionalPrimary', 'traditionalSpouse'] as $source) {
            if ($shortfall <= 0.0) {
                break;
            }

            $withdrawal = min($balances[$source], $shortfall);
            if ($source === 'taxable' && $balances['taxable'] > 0.0) {
                $basisReduction = min($balances['taxableBasis'], $withdrawal * ($balances['taxableBasis'] / $balances['taxable']));
                $balances['taxableBasis'] = $this->money($balances['taxableBasis'] - $basisReduction);
            }

            $balances[$source] = $this->money($balances[$source] - $withdrawal);
            $shortfall = $this->money($shortfall - $withdrawal);
            $withdrawalKey = str_starts_with($source, 'traditional') ? 'traditional' : $source;
            $withdrawals[$withdrawalKey] = MoneyMath::sum([$withdrawals[$withdrawalKey], $withdrawal]);
            $withdrawals['total'] = MoneyMath::sum([$withdrawals['total'], $withdrawal]);
        }

        $balances['cash'] = $shortfall > 0.0 ? -$shortfall : 0.0;
        $withdrawals['unfunded'] = max(0.0, $shortfall);

        return ['balances' => $balances, 'withdrawals' => array_map(fn (float $value): float => $this->money($value), $withdrawals)];
    }

    private function growthRateForAge(RothConversionInputs $inputs, int $primaryAge): float
    {
        $retirementAge = $inputs->int('income.retirementAgePrimary');
        $rate = $primaryAge < $retirementAge
            ? $inputs->number('assumptions.preRetirementGrowthPercent')
            : $inputs->number('assumptions.postRetirementGrowthPercent');

        return $this->rate($rate);
    }

    /**
     * V1 models the statutory survivor filing bridge only: MFJ, then two QSS years, then Single.
     */
    private function statusForAge(FilingStatus $initial, int $primaryAge, ?int $firstDeathAge): FilingStatus
    {
        if (! $initial->isMarriedLike() || $firstDeathAge === null || $primaryAge <= $firstDeathAge) {
            return $initial;
        }

        return $primaryAge <= $firstDeathAge + 2
            ? FilingStatus::QualifyingSurvivingSpouse
            : FilingStatus::Single;
    }

    private function spouseAlive(int $primaryAge, int $spouseAge, int $spouseEndAge, ?int $firstDeathAge): bool
    {
        return $spouseAge <= $spouseEndAge && ($firstDeathAge === null || $primaryAge <= $firstDeathAge);
    }

    /**
     * @return array{primary: float, spouse: float, total: float}
     */
    private function requiredMinimumDistributions(float $traditionalPrimary, float $traditionalSpouse, int $primaryAge, int $spouseAge, int $primaryBirthYear, int $spouseBirthYear, bool $spouseAlive): array
    {
        $primaryRmd = $primaryAge >= Rmd::requiredBeginningAge($primaryBirthYear)
            ? $traditionalPrimary * Rmd::rate($primaryAge)
            : 0.0;
        $spouseRmd = $spouseAlive && $spouseAge >= Rmd::requiredBeginningAge($spouseBirthYear)
            ? $traditionalSpouse * Rmd::rate($spouseAge)
            : 0.0;

        return [
            'primary' => $this->money(min($traditionalPrimary, $primaryRmd)),
            'spouse' => $this->money(min($traditionalSpouse, $spouseRmd)),
            'total' => $this->money(min($traditionalPrimary + $traditionalSpouse, $primaryRmd + $spouseRmd)),
        ];
    }

    /**
     * @param  array<string, mixed>  $strategy
     * @param  array{propertyTax: float, medicalExpense: float, otherNondeductible: float, total: float}  $expenses
     * @param  array<int, float>  $ordinaryBeforeConversionComponents
     */
    private function rothConversionAmount(RothConversionInputs $inputs, array $strategy, float $traditionalBalance, int $year, int $primaryAge, FilingStatus $status, float $inflationRate, int $yearIndex, array $expenses, array $ordinaryBeforeConversionComponents, float $grossSocialSecurity, float $taxExemptInterest, float $preferentialIncomeForSocialSecurity): float
    {
        if ($traditionalBalance <= 0.0) {
            return 0.0;
        }

        $startAge = (int) ($strategy['conversionStartAge'] ?? 0);
        $endAge = (int) ($strategy['conversionEndAge'] ?? 200);
        if ($primaryAge < $startAge || $primaryAge > $endAge) {
            return 0.0;
        }

        $schedule = is_array($strategy['perYearConversions'] ?? null) ? $strategy['perYearConversions'] : [];
        if (array_key_exists((string) $year, $schedule) && is_numeric($schedule[(string) $year])) {
            return $this->money(min($traditionalBalance, max(0.0, (float) $schedule[(string) $year])));
        }

        $mode = (string) ($strategy['conversionMode'] ?? 'constant');
        if ($mode === 'fill_bracket') {
            $targetRate = ((float) ($strategy['bracketTarget'] ?? 24)) / 100.0;
            $ceiling = FederalBrackets::ordinaryBracketCeiling($year, $status, $targetRate, $inflationRate);
            $ordinaryBeforeConversion = MoneyMath::sum($ordinaryBeforeConversionComponents);
            $high = $traditionalBalance;
            $low = 0.0;

            for ($iteration = 0; $iteration < 32; $iteration++) {
                $candidate = ($low + $high) / 2.0;
                $taxableSocialSecurity = SocialSecurity::taxablePortion(
                    $status,
                    $grossSocialSecurity,
                    $ordinaryBeforeConversion + $candidate + $preferentialIncomeForSocialSecurity,
                    $taxExemptInterest,
                );
                $ordinaryIncome = MoneyMath::sum([$ordinaryBeforeConversion, $candidate, $taxableSocialSecurity]);
                $candidateAgi = MoneyMath::sum([$ordinaryIncome, $preferentialIncomeForSocialSecurity]);
                $candidateMagi = MoneyMath::sum([$candidateAgi, $taxExemptInterest]);
                $deduction = $this->deductionBreakdown($inputs, $year, $status, $inflationRate, $yearIndex, $candidateAgi, $candidateMagi, $expenses)['deductionUsed'];
                $taxableOrdinaryIncome = max(0.0, $ordinaryIncome - $deduction);

                if ($taxableOrdinaryIncome <= $ceiling + 0.005) {
                    $low = $candidate;
                } else {
                    $high = $candidate;
                }
            }

            return $this->money($low);
        }

        return $this->money(min($traditionalBalance, max(0.0, (float) ($strategy['annualConversion'] ?? 0.0))));
    }

    /**
     * Assumes a sell-and-immediate-rebuy harvest: taxable balance stays invested while basis steps up.
     *
     * @param  array<string, mixed>  $strategy
     * @param  array<string, float>  $balances
     * @param  callable(float): float  $deductionForCandidate
     */
    private function harvestedLongTermGains(array $strategy, int $year, FilingStatus $status, float $ordinaryBeforeDeduction, float $existingPreferentialIncome, array &$balances, float $inflationRate, callable $deductionForCandidate): float
    {
        if (($strategy['harvestLtcg'] ?? false) !== true || $balances['taxable'] <= $balances['taxableBasis']) {
            return 0.0;
        }

        $targetRate = ((float) ($strategy['ltcgTargetRate'] ?? 0)) / 100.0;
        $targetCeiling = $targetRate <= 0.0
            ? FederalBrackets::capitalGainZeroRateCeiling($year, $status, $inflationRate)
            : FederalBrackets::capitalGainFifteenRateCeiling($year, $status, $inflationRate);

        $unrealizedGain = max(0.0, $balances['taxable'] - $balances['taxableBasis']);
        $low = 0.0;
        $high = $unrealizedGain;

        for ($iteration = 0; $iteration < 24; $iteration++) {
            $candidate = ($low + $high) / 2.0;
            $deduction = $deductionForCandidate($candidate);
            $ordinaryAfterDeduction = max(0.0, $ordinaryBeforeDeduction - $deduction);
            $stackPosition = MoneyMath::sum([$ordinaryAfterDeduction, $existingPreferentialIncome, $candidate]);

            if ($stackPosition <= $targetCeiling + 0.005) {
                $low = $candidate;
            } else {
                $high = $candidate;
            }
        }

        $harvest = $this->money($low);

        $balances['taxableBasis'] = $this->money($balances['taxableBasis'] + $harvest);

        return $harvest;
    }

    private function socialSecurityBenefit(float $piaMonthly, int $fra, int $claimAge, int $age, int $yearIndex, float $colaPercent): float
    {
        if ($piaMonthly <= 0.0 || $age < $claimAge) {
            return 0.0;
        }

        $adjustment = $this->claimingAdjustment($claimAge, $fra);
        $yearsSinceClaim = max(0, $age - $claimAge);
        $cola = (1.0 + $this->rate($colaPercent)) ** max(0, $yearIndex);

        return $this->money($piaMonthly * $adjustment * 12.0 * $cola);
    }

    private function claimingAdjustment(int $claimAge, int $fra): float
    {
        if ($claimAge === $fra) {
            return 1.0;
        }

        if ($claimAge < $fra) {
            $monthsEarly = ($fra - $claimAge) * 12;
            $first36 = min(36, $monthsEarly);
            $additional = max(0, $monthsEarly - 36);

            return max(0.0, 1.0 - ($first36 * (5.0 / 900.0)) - ($additional * (5.0 / 1200.0)));
        }

        return 1.0 + (($claimAge - $fra) * 0.08);
    }

    /**
     * @return list<array{age: int, claimAt62: float, claimAtFra: float, claimAt70: float, selectedClaimAge: int}>
     */
    private function socialSecurityBreakeven(RothConversionInputs $inputs, int $selectedClaimAge): array
    {
        $rows = [];
        $pia = $inputs->number('socialSecurity.piaPrimary');
        $fra = $inputs->int('socialSecurity.fraPrimary');
        $cola = $inputs->number('socialSecurity.colaPercent');
        $claimAges = [62, $fra, 70];
        $cumulative = [62 => 0.0, $fra => 0.0, 70 => 0.0];

        for ($age = 62; $age <= $inputs->int('people.primaryEndAge'); $age++) {
            foreach ($claimAges as $claimAge) {
                $cumulative[$claimAge] = MoneyMath::sum([$cumulative[$claimAge], $this->socialSecurityBenefit($pia, $fra, $claimAge, $age, $age - 62, $cola)]);
            }

            $rows[] = [
                'age' => $age,
                'claimAt62' => $this->money($cumulative[62]),
                'claimAtFra' => $this->money($cumulative[$fra]),
                'claimAt70' => $this->money($cumulative[70]),
                'selectedClaimAge' => $selectedClaimAge,
            ];
        }

        return $rows;
    }

    /**
     * @return list<array{age: int, divisor: float, rate: float}>
     */
    private function rmdRates(): array
    {
        $rows = [];

        for ($age = 72; $age <= 100; $age++) {
            $rows[] = ['age' => $age, 'divisor' => Rmd::divisor($age), 'rate' => Rmd::rate($age)];
        }

        return $rows;
    }

    /**
     * @return list<array{provisionalIncome: float, taxablePercent: float}>
     */
    private function socialSecurityTaxationSteps(FilingStatus $status): array
    {
        $benefit = 40000.0;
        $rows = [];

        for ($income = 0; $income <= 120000; $income += 5000) {
            $taxable = SocialSecurity::taxablePortion($status, $benefit, $income);
            $rows[] = ['provisionalIncome' => $income + ($benefit * 0.5), 'taxablePercent' => round($taxable / $benefit, 4)];
        }

        return $rows;
    }

    /**
     * @param  array<string, float>  $balances
     * @return array<string, float>
     */
    private function visibleBalances(array $balances): array
    {
        return [
            'traditional' => $this->traditionalBalance($balances),
            'traditionalPrimary' => $this->money($balances['traditionalPrimary']),
            'traditionalSpouse' => $this->money($balances['traditionalSpouse']),
            'roth' => $this->money($balances['roth']),
            'hsa' => $this->money($balances['hsa']),
            'taxable' => $this->money($balances['taxable']),
            'cash' => $this->money($balances['cash']),
        ];
    }

    /**
     * @param  array<string, float>  $balances
     */
    private function estateValue(array $balances): float
    {
        return $this->money($this->traditionalBalance($balances) + $balances['roth'] + $balances['hsa'] + $balances['taxable'] + $balances['cash']);
    }

    /**
     * @param  array<string, float>  $balances
     */
    private function traditionalBalance(array $balances): float
    {
        return $this->money($balances['traditionalPrimary'] + $balances['traditionalSpouse']);
    }

    /**
     * @param  array<string, float>  $balances
     * @return array<string, float>
     */
    private function withdrawFromTraditionalBuckets(array $balances, float $amount): array
    {
        $amount = min(max(0.0, $amount), $this->traditionalBalance($balances));
        if ($amount <= 0.0) {
            return $balances;
        }

        $total = $this->traditionalBalance($balances);
        $primaryWithdrawal = $this->money(min($balances['traditionalPrimary'], $amount * ($balances['traditionalPrimary'] / $total)));
        $spouseWithdrawal = $this->money(min($balances['traditionalSpouse'], $amount - $primaryWithdrawal));
        $roundingRemainder = $this->money($amount - $primaryWithdrawal - $spouseWithdrawal);
        if ($roundingRemainder > 0.0) {
            $primaryWithdrawal = $this->money($primaryWithdrawal + min($balances['traditionalPrimary'] - $primaryWithdrawal, $roundingRemainder));
        }

        $balances['traditionalPrimary'] = $this->money($balances['traditionalPrimary'] - $primaryWithdrawal);
        $balances['traditionalSpouse'] = $this->money($balances['traditionalSpouse'] - $spouseWithdrawal);

        return $balances;
    }

    /**
     * @param  list<array<string, mixed>>  $scenarios
     * @return list<string>
     */
    private function projectionWarnings(array $scenarios): array
    {
        $warnings = [];

        foreach ($scenarios as $scenario) {
            $summary = is_array($scenario['summary'] ?? null) ? $scenario['summary'] : [];
            if (($summary['cashShortfallTaxApproximationYears'] ?? 0) > 0) {
                $name = (string) ($scenario['name'] ?? 'Scenario');
                $warnings[] = "{$name}: Cash shortfall withdrawals from taxable or pre-tax accounts reduce balances, but this v1 projection does not recompute additional realized-gain or ordinary-income tax in that same year. Review rows with cash shortfall withdrawals before relying on lifetime-tax totals.";
            }
        }

        return $warnings;
    }

    private function inflate(float $amount, float $inflationRate, int $yearIndex): float
    {
        return $this->money($amount * ((1.0 + $inflationRate) ** $yearIndex));
    }

    private function discountFactor(float $discountRate, int $yearIndex): float
    {
        return $discountRate <= 0.0 ? 1.0 : (1.0 + $discountRate) ** $yearIndex;
    }

    private function rate(float $percent): float
    {
        return max(0.0, $percent) / 100.0;
    }

    private function money(float $value): float
    {
        return MoneyMath::round($value);
    }
}
