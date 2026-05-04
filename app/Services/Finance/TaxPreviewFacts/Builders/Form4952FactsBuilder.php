<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleBFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;

class Form4952FactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     * @param  TaxFactSource[]  $marginInterestSources
     */
    public function build(array $k1Docs, array $docs1099, ScheduleBFacts $scheduleB, float $shortDividendDeduction, array $marginInterestSources = []): Form4952Facts
    {
        $investmentInterestSources = [];
        $investmentExpenseSources = [];
        $excludedInvestmentExpenseSources = [];

        if ($shortDividendDeduction > 0.0) {
            $investmentInterestSources[] = new TaxFactSource(
                id: 'short-dividends-form4952-line1',
                label: 'Short dividends — positions held > 45 days (IRS Pub. 550)',
                amount: $this->roundMoney(-abs($shortDividendDeduction)),
                sourceType: 'short_dividend_investment_interest',
                routing: 'form_4952_line_1',
                routingReason: 'Short-dividend substitute payments on short positions held more than 45 days are treated as investment interest expense.',
                isReviewed: true,
            );
        }

        foreach ($marginInterestSources as $source) {
            $investmentInterestSources[] = $source;
        }

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            foreach (['H', 'G', 'AC', 'AD'] as $code) {
                foreach ($this->k1CodeItems($data, '13', $code) as $index => $item) {
                    $rawAmount = $this->parseMoney($item['value'] ?? null);
                    if ($rawAmount === null || $rawAmount === 0.0) {
                        continue;
                    }

                    $investmentInterestSources[] = new TaxFactSource(
                        id: "k1-{$doc->id}-13{$code}-{$index}",
                        label: "{$partnerName} — Box 13{$code}",
                        amount: $this->roundMoney(-abs($rawAmount)),
                        sourceType: 'k1_investment_interest',
                        taxDocumentId: $doc->id,
                        formType: $this->formType($doc),
                        box: '13',
                        code: $code,
                        routing: 'form_4952_line_1',
                        routingReason: 'K-1 Box 13 investment-interest codes feed Form 4952 Part I.',
                        notes: is_string($item['notes'] ?? null) ? $item['notes'] : null,
                        isReviewed: $this->sourceIsReviewed($doc),
                        reviewStatus: $this->reviewStatus($doc),
                        reviewAction: $this->reviewAction($doc),
                    );
                }
            }

            foreach ($this->k1CodeItems($data, '20', 'B') as $index => $item) {
                $rawAmount = $this->parseMoney($item['value'] ?? null);
                if ($rawAmount === null || $rawAmount === 0.0) {
                    continue;
                }

                $excludedInvestmentExpenseSources[] = new TaxFactSource(
                    id: "k1-{$doc->id}-20B-{$index}",
                    label: "{$partnerName} — Box 20B (investment expenses)",
                    amount: $this->roundMoney(-abs($rawAmount)),
                    sourceType: 'k1_excluded_investment_expense',
                    taxDocumentId: $doc->id,
                    formType: $this->formType($doc),
                    box: '20',
                    code: 'B',
                    routing: 'excluded_form_4952_line_5',
                    routingReason: 'K-1 Box 20B investment expenses are tracked for debugging but are excluded from the current Form 4952 line 5 return treatment.',
                    notes: is_string($item['notes'] ?? null) ? $item['notes'] : null,
                    isReviewed: $this->sourceIsReviewed($doc),
                    reviewStatus: $this->reviewStatus($doc),
                    reviewAction: $this->reviewAction($doc),
                );
            }
        }

        foreach ($docs1099 as $doc) {
            foreach ($this->document1099IntEntries($doc) as $entry) {
                $amount = $this->numericValue($entry['parsedData'], 'box5_investment_expense');
                if ($amount === null || $amount === 0.0) {
                    continue;
                }

                $payer = $this->payerName($doc, $entry['link'], $entry['parsedData']);
                $investmentInterestSources[] = new TaxFactSource(
                    id: $entry['link'] instanceof TaxDocumentAccount
                        ? "link-{$entry['link']->id}-1099-int-box5"
                        : "doc-{$doc->id}-1099-int-box5",
                    label: "{$payer} — 1099-INT Box 5 (investment expense)",
                    amount: $this->roundMoney(-abs($amount)),
                    sourceType: '1099_int_investment_expense',
                    taxDocumentId: $doc->id,
                    taxDocumentAccountId: $entry['link']?->id,
                    accountId: $entry['link']?->account_id,
                    formType: '1099_int',
                    box: '5',
                    routing: 'form_4952_line_1',
                    routingReason: 'The current client preview treats 1099-INT Box 5 as an investment-interest source for Form 4952.',
                    isReviewed: $this->sourceIsReviewed($doc, $entry['link']),
                    reviewStatus: $this->reviewStatus($doc, $entry['link']),
                    reviewAction: $this->reviewAction($doc, $entry['link']),
                );
            }
        }

        $totalInvestmentInterestExpense = abs($this->sumSources($investmentInterestSources));
        $totalInvestmentExpenses = abs($this->sumSources($investmentExpenseSources));
        $totalExcludedInvestmentExpenses = abs($this->sumSources($excludedInvestmentExpenseSources));
        $grossInvestmentIncomeFromScheduleB = $scheduleB->form4952Line5aTotal;
        $grossInvestmentIncomeFromK1 = $this->k1Form4952GrossInvestmentIncome($k1Docs);
        $grossInvestmentIncomeTotal = $this->roundMoney($grossInvestmentIncomeFromScheduleB + $grossInvestmentIncomeFromK1);
        $totalQualifiedDividends = $this->form4952QualifiedDividendsIncludedInGross($k1Docs, $scheduleB);
        $line4c = $this->roundMoney($grossInvestmentIncomeTotal - $totalQualifiedDividends);
        $niiBefore = max(0.0, $this->roundMoney($line4c - $totalInvestmentExpenses));
        $deductible = min($totalInvestmentInterestExpense, $niiBefore);
        $carryforward = max(0.0, $this->roundMoney($totalInvestmentInterestExpense - $deductible));

        return new Form4952Facts(
            investmentInterestSources: $investmentInterestSources,
            totalInvestmentInterestExpense: $totalInvestmentInterestExpense,
            investmentExpenseSources: $investmentExpenseSources,
            totalInvestmentExpenses: $totalInvestmentExpenses,
            excludedInvestmentExpenseSources: $excludedInvestmentExpenseSources,
            totalExcludedInvestmentExpenses: $totalExcludedInvestmentExpenses,
            grossInvestmentIncomeFromScheduleB: $grossInvestmentIncomeFromScheduleB,
            grossInvestmentIncomeFromK1: $grossInvestmentIncomeFromK1,
            grossInvestmentIncomeTotal: $grossInvestmentIncomeTotal,
            line4cNetInvestmentIncomeAfterQualifiedDividends: $line4c,
            netInvestmentIncomeBeforeQualifiedDividendElection: $niiBefore,
            totalQualifiedDividends: $totalQualifiedDividends,
            deductibleInvestmentInterestExpense: $deductible,
            disallowedCarryforward: $carryforward,
        );
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     */
    private function k1Form4952GrossInvestmentIncome(array $k1Docs): float
    {
        $total = 0.0;

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $box20A = $this->sumK1CodeItems($data, '20', 'A');
            $total += $box20A !== 0.0
                ? $box20A
                : $this->roundMoney(
                    $this->k1Field($data, '5')
                    + $this->k1Field($data, '6a')
                    - $this->k1Field($data, '6b')
                    + $this->sumK1CodeItems($data, '11', 'C')
                );
        }

        return $this->roundMoney($total);
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     */
    private function form4952QualifiedDividendsIncludedInGross(array $k1Docs, ScheduleBFacts $scheduleB): float
    {
        $directQualifiedDividends = $this->sumSourcesByTypes($scheduleB->qualifiedDividendSources, ['1099_div_qualified_dividends']);
        $k1QualifiedDividendsIncludedInBox20A = 0.0;

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null || $this->sumK1CodeItems($data, '20', 'A') === 0.0) {
                continue;
            }

            $k1QualifiedDividendsIncludedInBox20A += $this->k1Field($data, '6b');
        }

        return $this->roundMoney($directQualifiedDividends + $k1QualifiedDividendsIncludedInBox20A);
    }
}
