<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Services\Finance\MoneyMath;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8960Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleAFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleBFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleDFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleEFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use App\Services\Tax\PureTaxMath\FilingStatus;
use App\Services\Tax\PureTaxMath\Niit;
use LogicException;

class Form8960FactsBuilder extends TaxPreviewFactBuilder
{
    private const float SINGLE_THRESHOLD = 200000.0;

    private const float MARRIED_FILING_JOINTLY_THRESHOLD = 250000.0;

    public function build(ScheduleBFacts $scheduleB, ScheduleEFacts $scheduleE, ScheduleDFacts $scheduleD, Form4952Facts $form4952, ?ScheduleAFacts $scheduleA = null, ?float $magi = null, ?int $userId = null, ?int $year = null, bool $magiIsEstimated = false): Form8960Facts
    {
        $taxableInterest = $scheduleB->interestTotal;
        $ordinaryDividends = $scheduleB->ordinaryDividendTotal;
        // IRC §1211(b): individuals may deduct net capital losses only to the extent of $3,000 per year.
        $netCapGains = max(-3000.0, (float) $scheduleD->line16Combined);
        $passiveIncome = $scheduleE->totalPassive;
        $nonpassiveTradingIncome = $scheduleE->totalTraderNii;
        $investmentInterestExpense = $form4952->deductibleInvestmentInterestExpense;
        $grossNii = $this->sumMoney([$taxableInterest, $ordinaryDividends, $netCapGains, $passiveIncome, $nonpassiveTradingIncome]);

        // Treas. Reg. §1.1411-4(f)(3)(iii): SALT/foreign income tax allocable to investment income via ratio of NII to AGI.
        $stateLocalForeignIncomeTax = $this->allocatedStateLocalForeignIncomeTax($scheduleA, $grossNii, $magi);

        $totalDeductions = $this->sumMoney([$investmentInterestExpense, $stateLocalForeignIncomeTax]);
        $netInvestmentIncome = max(0.0, $this->subtractMoney($grossNii, $totalDeductions));

        // MAGI = AGI + foreign earned income exclusion (when applicable). With no FEIE inputs we treat MAGI = AGI.
        $resolvedMagi = (float) ($magi ?? 0.0);
        $magiExcessSingle = max(0.0, $this->subtractMoney($resolvedMagi, self::SINGLE_THRESHOLD));
        $magiExcessMarriedFilingJointly = max(0.0, $this->subtractMoney($resolvedMagi, self::MARRIED_FILING_JOINTLY_THRESHOLD));
        $niitTaxSingle = Niit::tax(FilingStatus::Single, $resolvedMagi, $netInvestmentIncome);
        $niitTaxMarriedFilingJointly = Niit::tax(FilingStatus::MarriedFilingJointly, $resolvedMagi, $netInvestmentIncome);

        return new Form8960Facts(
            taxableInterest: $taxableInterest,
            ordinaryDividends: $ordinaryDividends,
            netCapGains: $netCapGains,
            passiveIncome: $passiveIncome,
            nonpassiveTradingIncome: $nonpassiveTradingIncome,
            investmentInterestExpense: $investmentInterestExpense,
            stateLocalForeignIncomeTax: $stateLocalForeignIncomeTax,
            grossNII: $grossNii,
            totalDeductions: $totalDeductions,
            netInvestmentIncome: $netInvestmentIncome,
            magi: $resolvedMagi,
            thresholdSingle: self::SINGLE_THRESHOLD,
            thresholdMarriedFilingJointly: self::MARRIED_FILING_JOINTLY_THRESHOLD,
            magiExcessSingle: $magiExcessSingle,
            magiExcessMarriedFilingJointly: $magiExcessMarriedFilingJointly,
            niitTaxSingle: $niitTaxSingle,
            niitTaxMarriedFilingJointly: $niitTaxMarriedFilingJointly,
            needsMagi: $magi === null || $magiIsEstimated,
            componentSources: $this->componentSources($scheduleB, $scheduleE, $scheduleD, $form4952, $netCapGains, $stateLocalForeignIncomeTax, $userId, $year),
        );
    }

    /**
     * Treas. Reg. §1.1411-4(f)(3)(iii): allocate state/local/foreign income taxes between investment
     * and non-investment income using the ratio of net investment income (gross NII before deductions)
     * to AGI. Floored at 0 and capped at the actual state income tax total.
     */
    private function allocatedStateLocalForeignIncomeTax(?ScheduleAFacts $scheduleA, float $grossNii, ?float $magi): float
    {
        if (! $scheduleA instanceof ScheduleAFacts) {
            return 0.0;
        }

        $stateIncomeTax = $scheduleA->stateIncomeTaxTotal;
        if ($stateIncomeTax <= 0.0 || $magi === null || $magi <= 0.0 || $grossNii <= 0.0) {
            return 0.0;
        }

        $ratio = $grossNii / $magi;
        $allocated = MoneyMath::multiply($stateIncomeTax, $ratio);

        return max(0.0, min($stateIncomeTax, $allocated));
    }

    /**
     * @return TaxFactSource[]
     */
    private function componentSources(ScheduleBFacts $scheduleB, ScheduleEFacts $scheduleE, ScheduleDFacts $scheduleD, Form4952Facts $form4952, float $netCapGains, float $stateLocalForeignIncomeTax, ?int $userId, ?int $year): array
    {
        $idPrefix = $userId !== null && $year !== null ? "{$userId}-{$year}-" : '';
        $sources = [
            ...array_map(
                fn (TaxFactSource $source): TaxFactSource => $this->cloneFor8960($source, TaxFactRouting::Form8960Line1, 'Schedule B interest is net investment income for Form 8960 line 1.'),
                $scheduleB->interestSources,
            ),
            ...array_map(
                fn (TaxFactSource $source): TaxFactSource => $this->cloneFor8960($source, TaxFactRouting::Form8960Line2, 'Schedule B ordinary dividends are net investment income for Form 8960 line 2.'),
                $scheduleB->ordinaryDividendSources,
            ),
            ...array_map(
                fn (TaxFactSource $source): TaxFactSource => $this->cloneFor8960($source, TaxFactRouting::Form8960Line4a, 'Schedule E passive income is net investment income for Form 8960 line 4a.'),
                [...$scheduleE->box2Sources, ...$scheduleE->box3Sources],
            ),
            ...array_map(
                fn (TaxFactSource $source): TaxFactSource => $this->cloneFor8960($source, TaxFactRouting::Form8960Line4a, 'Trader-fund nonpassive ordinary income/loss is tracked as net investment income for Form 8960 line 4a.'),
                $scheduleE->traderNiiSources,
            ),
        ];

        if ($form4952->deductibleInvestmentInterestExpense > 0.0) {
            $sources[] = new TaxFactSource(
                id: "{$idPrefix}form4952-form8960-line9a",
                label: 'Form 4952 allowed investment interest expense',
                amount: -$form4952->deductibleInvestmentInterestExpense,
                sourceType: TaxFactSourceType::Form8960InvestmentInterestDeduction,
                routing: TaxFactRouting::Form8960Line9a,
                routingReason: 'Allowed investment interest expense reduces net investment income on Form 8960 line 9a.',
                notes: "Form 4952 line 8 {$form4952->deductibleInvestmentInterestExpense}",
            );
        }

        if ($netCapGains > 0.0) {
            $sources[] = new TaxFactSource(
                id: "{$idPrefix}schedule-d-form8960-line5a",
                label: 'Schedule D net capital gain',
                amount: $netCapGains,
                sourceType: TaxFactSourceType::Form8960NetCapitalGain,
                routing: TaxFactRouting::Form8960Line5a,
                routingReason: 'Positive Schedule D line 16 capital gains are included in Form 8960 line 5a.',
                notes: "Schedule D line 16 {$scheduleD->line16Combined}",
            );
        }

        if ($stateLocalForeignIncomeTax > 0.0) {
            $sources[] = new TaxFactSource(
                id: "{$idPrefix}schedule-a-form8960-line9b",
                label: 'State, local, and foreign income tax allocated to investment income',
                amount: -$stateLocalForeignIncomeTax,
                sourceType: TaxFactSourceType::Form8960StateLocalForeignIncomeTax,
                routing: TaxFactRouting::Form8960Line9b,
                routingReason: 'State, local, and foreign income tax allocable to investment income reduces NII on Form 8960 line 9b (Treas. Reg. §1.1411-4(f)(3)(iii)).',
                notes: 'Allocated via ratio of net investment income to AGI per Treas. Reg. §1.1411-4(f)(3)(iii)',
            );
        }

        return $sources;
    }

    private function cloneFor8960(TaxFactSource $source, TaxFactRouting $routing, string $routingReason): TaxFactSource
    {
        $sourceType = TaxFactSourceType::tryFrom($source->sourceType);
        if (! $sourceType instanceof TaxFactSourceType) {
            throw new LogicException("Cannot clone tax fact source {$source->id} for Form 8960 because source type {$source->sourceType} is not recognized.");
        }

        return new TaxFactSource(
            id: "{$source->id}-form8960",
            label: $source->label,
            amount: $source->amount,
            sourceType: $sourceType,
            taxDocumentId: $source->taxDocumentId,
            taxDocumentAccountId: $source->taxDocumentAccountId,
            accountId: $source->accountId,
            formType: $source->formType,
            box: $source->box,
            code: $source->code,
            routing: $routing,
            routingReason: $routingReason,
            notes: $source->notes,
            isReviewed: $source->isReviewed,
            reviewStatus: $source->reviewStatus,
            reviewAction: $source->reviewAction,
        );
    }
}
