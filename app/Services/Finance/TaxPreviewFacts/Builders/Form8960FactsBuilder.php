<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Services\Finance\TaxPreviewFacts\Data\Form4952Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8960Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleBFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleDFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleEFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class Form8960FactsBuilder extends TaxPreviewFactBuilder
{
    private const float SINGLE_THRESHOLD = 200000.0;

    private const float MARRIED_FILING_JOINTLY_THRESHOLD = 250000.0;

    public function build(ScheduleBFacts $scheduleB, ScheduleEFacts $scheduleE, ScheduleDFacts $scheduleD, Form4952Facts $form4952, ?float $magi = null): Form8960Facts
    {
        $taxableInterest = $scheduleB->interestTotal;
        $ordinaryDividends = $scheduleB->ordinaryDividendTotal;
        $netCapGains = max(0.0, $scheduleD->line16Combined);
        $passiveIncome = $scheduleE->totalPassive;
        $nonpassiveTradingIncome = $scheduleE->totalTraderNii;
        $investmentInterestExpense = $form4952->deductibleInvestmentInterestExpense;
        $grossNii = $this->sumMoney([$taxableInterest, $ordinaryDividends, $netCapGains, $passiveIncome, $nonpassiveTradingIncome]);
        $netInvestmentIncome = max(0.0, $this->subtractMoney($grossNii, $investmentInterestExpense));

        return new Form8960Facts(
            taxableInterest: $taxableInterest,
            ordinaryDividends: $ordinaryDividends,
            netCapGains: $netCapGains,
            passiveIncome: $passiveIncome,
            nonpassiveTradingIncome: $nonpassiveTradingIncome,
            investmentInterestExpense: $investmentInterestExpense,
            grossNII: $grossNii,
            totalDeductions: $investmentInterestExpense,
            netInvestmentIncome: $netInvestmentIncome,
            magi: $magi,
            thresholdSingle: self::SINGLE_THRESHOLD,
            thresholdMarriedFilingJointly: self::MARRIED_FILING_JOINTLY_THRESHOLD,
            magiExcessSingle: $this->magiExcess($magi, self::SINGLE_THRESHOLD),
            magiExcessMarriedFilingJointly: $this->magiExcess($magi, self::MARRIED_FILING_JOINTLY_THRESHOLD),
            niitTaxSingle: $this->niitTax($magi, self::SINGLE_THRESHOLD, $netInvestmentIncome),
            niitTaxMarriedFilingJointly: $this->niitTax($magi, self::MARRIED_FILING_JOINTLY_THRESHOLD, $netInvestmentIncome),
            needsMagi: $magi === null,
            componentSources: $this->componentSources($scheduleB, $scheduleE, $scheduleD, $form4952, $netCapGains),
        );
    }

    /**
     * @return TaxFactSource[]
     */
    private function componentSources(ScheduleBFacts $scheduleB, ScheduleEFacts $scheduleE, ScheduleDFacts $scheduleD, Form4952Facts $form4952, float $netCapGains): array
    {
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
                id: 'form4952-form8960-line9a',
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
                id: 'schedule-d-form8960-line5a',
                label: 'Schedule D net capital gain',
                amount: $netCapGains,
                sourceType: TaxFactSourceType::Form8960NetCapitalGain,
                routing: TaxFactRouting::Form8960Line5a,
                routingReason: 'Positive Schedule D line 16 capital gains are included in Form 8960 line 5a.',
                notes: "Schedule D line 16 {$scheduleD->line16Combined}",
            );
        }

        return $sources;
    }

    private function cloneFor8960(TaxFactSource $source, TaxFactRouting $routing, string $routingReason): TaxFactSource
    {
        return new TaxFactSource(
            id: "{$source->id}-form8960",
            label: $source->label,
            amount: $source->amount,
            sourceType: TaxFactSourceType::tryFrom($source->sourceType) ?? TaxFactSourceType::Form1099IntInterest,
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

    private function magiExcess(?float $magi, float $threshold): ?float
    {
        return $magi === null ? null : max(0.0, $this->subtractMoney($magi, $threshold));
    }

    private function niitTax(?float $magi, float $threshold, float $netInvestmentIncome): ?float
    {
        $magiExcess = $this->magiExcess($magi, $threshold);
        if ($magiExcess === null) {
            return null;
        }

        return $this->roundMoney(min($netInvestmentIncome, $magiExcess) * 0.038);
    }
}
