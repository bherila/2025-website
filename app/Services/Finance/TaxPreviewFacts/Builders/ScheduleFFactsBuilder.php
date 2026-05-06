<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Enums\Finance\DeductionCategory;
use App\Models\FinanceTool\UserDeduction;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleFFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class ScheduleFFactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  UserDeduction[]  $userDeductions
     */
    public function build(array $userDeductions): ScheduleFFacts
    {
        $grossIncomeSources = $this->manualSources(
            $userDeductions,
            DeductionCategory::ScheduleFGrossIncome->value,
            TaxFactSourceType::ScheduleFGrossIncome,
            TaxFactRouting::ScheduleFLine9,
            'Schedule F line 9 gross farm income is sourced from the manual farm-income entry.',
        );
        $expenseSources = $this->manualSources(
            $userDeductions,
            DeductionCategory::ScheduleFExpenses->value,
            TaxFactSourceType::ScheduleFExpenses,
            TaxFactRouting::ScheduleFLine33,
            'Schedule F line 33 total farm expenses are sourced from the manual farm-expense entry.',
        );
        $grossFarmIncome = $this->sumSources($grossIncomeSources);
        $totalFarmExpenses = $this->sumSources($expenseSources);
        $netFarmProfit = $this->subtractMoney($grossFarmIncome, $totalFarmExpenses);
        $hasActivity = $grossFarmIncome !== 0.0 || $totalFarmExpenses !== 0.0;

        return new ScheduleFFacts(
            grossIncomeSources: $grossIncomeSources,
            grossFarmIncome: $grossFarmIncome,
            expenseSources: $expenseSources,
            totalFarmExpenses: $totalFarmExpenses,
            netFarmProfit: $netFarmProfit,
            hasActivity: $hasActivity,
            line34Sources: $hasActivity ? [$this->line34Source($netFarmProfit, $grossFarmIncome, $totalFarmExpenses)] : [],
        );
    }

    /**
     * @param  UserDeduction[]  $userDeductions
     * @return TaxFactSource[]
     */
    private function manualSources(array $userDeductions, string $category, TaxFactSourceType $sourceType, TaxFactRouting $routing, string $routingReason): array
    {
        $sources = [];

        foreach ($userDeductions as $deduction) {
            if ($deduction->category !== $category || (float) $deduction->amount === 0.0) {
                continue;
            }

            $sources[] = new TaxFactSource(
                id: "user-deduction-{$deduction->id}-schedule-f",
                label: $deduction->description ?: $this->defaultLabel($category),
                amount: $this->roundMoney((float) $deduction->amount),
                sourceType: $sourceType,
                routing: $routing,
                routingReason: $routingReason,
                isReviewed: true,
            );
        }

        return $sources;
    }

    private function line34Source(float $netFarmProfit, float $grossFarmIncome, float $totalFarmExpenses): TaxFactSource
    {
        return new TaxFactSource(
            id: 'schedule-f-line-34-net-profit',
            label: 'Schedule F net farm profit or loss',
            amount: $netFarmProfit,
            sourceType: TaxFactSourceType::ScheduleSEScheduleF,
            routing: TaxFactRouting::ScheduleFLine34,
            routingReason: 'Schedule F line 34 is line 9 gross farm income less line 33 total farm expenses.',
            notes: "Gross {$grossFarmIncome}; expenses {$totalFarmExpenses}. If the farming activity is passive, Form 8582 may limit a loss before it reaches the return.",
            isReviewed: true,
        );
    }

    private function defaultLabel(string $category): string
    {
        return match ($category) {
            DeductionCategory::ScheduleFGrossIncome->value => 'Schedule F gross farm income',
            DeductionCategory::ScheduleFExpenses->value => 'Schedule F total farm expenses',
            default => 'Schedule F manual entry',
        };
    }
}
