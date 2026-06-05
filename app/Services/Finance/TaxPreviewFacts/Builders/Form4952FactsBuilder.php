<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952CarryDestination;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952TracingSplit;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleBFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

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
        $materialParticipationScheduleEInterestSources = [];
        $scheduleESourceIds = [];
        $tracingSplitsBySourceId = [];

        if ($shortDividendDeduction > 0.0) {
            $investmentInterestSources[] = new TaxFactSource(
                id: 'short-dividends-form4952-line1',
                label: 'Short dividends — positions held > 45 days (IRS Pub. 550)',
                amount: $this->roundMoney(-abs($shortDividendDeduction)),
                sourceType: TaxFactSourceType::ShortDividendInvestmentInterest,
                routing: TaxFactRouting::Form4952Line1,
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
            $isTraderFund = $this->isTraderFundK1($data);
            $isMaterialParticipationTrader = $isTraderFund && $this->k1MaterialParticipationOverrideValue($data);
            foreach (['H', 'G', 'AC', 'AD'] as $code) {
                foreach ($this->k1CodeItems($data, '13', $code) as $index => $item) {
                    $rawAmount = $this->parseMoney($item['value'] ?? null);
                    if ($rawAmount === null || $rawAmount === 0.0) {
                        continue;
                    }

                    $sourceId = "k1-{$doc->id}-13{$code}-{$index}";
                    $tracingSplit = $this->k1Form4952TracingSplitOverrideValue($data, '13', $code);
                    if ($isMaterialParticipationTrader) {
                        $materialParticipationScheduleEInterestSources[] = new TaxFactSource(
                            id: "{$sourceId}-material-participation",
                            label: "{$partnerName} — Box 13{$code} materially-participating trader interest",
                            amount: $this->roundMoney(-abs($rawAmount)),
                            sourceType: TaxFactSourceType::K1MaterialParticipationTraderInterest,
                            taxDocumentId: $doc->id,
                            formType: $this->formType($doc),
                            box: '13',
                            code: $code,
                            routing: TaxFactRouting::ScheduleELine28,
                            routingReason: 'Material participation in a securities-trading partnership takes the Box 13 interest out of §163(d)/Form 4952; Pub. 550 and §62(a)(1) support a full above-the-line Schedule E deduction.',
                            notes: $this->box13InvestmentInterestNotes($item, $rawAmount),
                            isReviewed: $this->sourceIsReviewed($doc),
                            reviewStatus: $this->reviewStatus($doc),
                            reviewAction: $this->reviewAction($doc),
                        );

                        continue;
                    }

                    $investmentInterestSources[] = new TaxFactSource(
                        id: $sourceId,
                        label: "{$partnerName} — Box 13{$code}",
                        amount: $this->roundMoney($rawAmount),
                        sourceType: TaxFactSourceType::K1InvestmentInterest,
                        taxDocumentId: $doc->id,
                        formType: $this->formType($doc),
                        box: '13',
                        code: $code,
                        routing: TaxFactRouting::Form4952Line1,
                        routingReason: $isTraderFund
                            ? 'K-1 Box 13 investment-interest from a securities-trading partnership feeds Form 4952 Part I; the allowed portion is reported above-the-line on Schedule E (§163(d)(5)(A)(ii)).'
                            : 'K-1 Box 13 investment-interest codes feed Form 4952 Part I; the allowed portion is itemized on Schedule A line 9 (§163(d)(5)(A)(i)).',
                        notes: $this->box13InvestmentInterestNotes($item, $rawAmount),
                        isReviewed: $this->sourceIsReviewed($doc),
                        reviewStatus: $this->reviewStatus($doc),
                        reviewAction: $this->reviewAction($doc),
                    );
                    if ($isTraderFund) {
                        $scheduleESourceIds[] = $sourceId;
                    }
                    if ($tracingSplit !== null) {
                        $tracingSplitsBySourceId[$sourceId] = $tracingSplit;
                    }
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
                    sourceType: TaxFactSourceType::K1ExcludedInvestmentExpense,
                    taxDocumentId: $doc->id,
                    formType: $this->formType($doc),
                    box: '20',
                    code: 'B',
                    routing: TaxFactRouting::ExcludedForm4952Line5,
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
                    sourceType: TaxFactSourceType::Form1099IntInvestmentExpense,
                    taxDocumentId: $doc->id,
                    taxDocumentAccountId: $entry['link']?->id,
                    accountId: $entry['link']?->account_id,
                    formType: '1099_int',
                    box: '5',
                    routing: TaxFactRouting::Form4952Line1,
                    routingReason: 'The current client preview treats 1099-INT Box 5 as an investment-interest source for Form 4952.',
                    isReviewed: $this->sourceIsReviewed($doc, $entry['link']),
                    reviewStatus: $this->reviewStatus($doc, $entry['link']),
                    reviewAction: $this->reviewAction($doc, $entry['link']),
                );
            }
        }

        $totalInvestmentInterestExpense = $this->sumAbsoluteSources($investmentInterestSources);
        $totalInvestmentExpenses = $this->sumAbsoluteSources($investmentExpenseSources);
        $totalExcludedInvestmentExpenses = $this->sumAbsoluteSources($excludedInvestmentExpenseSources);
        $totalMaterialParticipationScheduleEInterest = $this->sumAbsoluteSources($materialParticipationScheduleEInterestSources);
        $grossInvestmentIncomeFromScheduleB = $scheduleB->form4952Line5aTotal;
        $grossInvestmentIncomeFromK1Sources = $this->k1Form4952GrossInvestmentIncomeSources($k1Docs);
        $grossInvestmentIncomeFromK1 = $this->sumSources($grossInvestmentIncomeFromK1Sources);
        $grossInvestmentIncomeTotal = $this->sumMoney([$grossInvestmentIncomeFromScheduleB, $grossInvestmentIncomeFromK1]);
        $qualifiedDividendSources = $this->form4952QualifiedDividendSources($k1Docs, $scheduleB);
        $totalQualifiedDividends = $this->form4952QualifiedDividendsIncludedInGross($k1Docs, $scheduleB);
        $line4c = $this->subtractMoney($grossInvestmentIncomeTotal, $totalQualifiedDividends);
        $niiBefore = max(0.0, $this->subtractMoney($line4c, $totalInvestmentExpenses));
        $deductible = min($totalInvestmentInterestExpense, $niiBefore);
        $carryforward = max(0.0, $this->subtractMoney($totalInvestmentInterestExpense, $deductible));

        $allocation = $this->allocateInvestmentInterestSources(
            $investmentInterestSources,
            $scheduleESourceIds,
            $tracingSplitsBySourceId,
        );
        $scheduleASources = $allocation['scheduleASources'];
        $scheduleESources = $allocation['scheduleESources'];
        $grossScheduleA = $allocation['grossScheduleA'];
        $grossScheduleE = $allocation['grossScheduleE'];
        $tracingSplitSources = $allocation['tracingSplitSources'];
        $hasTracingSplits = $allocation['hasTracingSplits'];

        // The §163(d)(1) limit applies to the aggregate; the allowed deduction and the
        // carryforward are split pro rata between the two categories (Rev. Rul. 2008-38).
        $totalGrossCents = MoneyMath::toCents($totalInvestmentInterestExpense);
        $scheduleEGrossCents = MoneyMath::toCents($grossScheduleE);
        if ($totalGrossCents > 0) {
            $deductibleSplit = MoneyMath::allocateRatio($deductible, $scheduleEGrossCents, $totalGrossCents);
            $carryforwardSplit = MoneyMath::allocateRatio($carryforward, $scheduleEGrossCents, $totalGrossCents);
            $deductibleScheduleE = $deductibleSplit['allocated'];
            $deductibleScheduleA = $deductibleSplit['remainder'];
            $carryforwardScheduleE = $carryforwardSplit['allocated'];
            $carryforwardScheduleA = $carryforwardSplit['remainder'];
        } else {
            $deductibleScheduleE = 0.0;
            $deductibleScheduleA = 0.0;
            $carryforwardScheduleE = 0.0;
            $carryforwardScheduleA = 0.0;
        }

        $carryDestinations = [];
        if ($grossScheduleA > 0.0) {
            $carryDestinations[] = new Form4952CarryDestination(
                destination: 'sch-a',
                label: 'Schedule A, line 9 — itemized investment interest',
                formLine: 'Schedule A, line 9',
                grossInterest: $grossScheduleA,
                allowedDeduction: $deductibleScheduleA,
                carryforward: $carryforwardScheduleA,
                share: $totalInvestmentInterestExpense > 0.0 ? round($grossScheduleA / $totalInvestmentInterestExpense, 6) : 0.0,
                citation: 'IRC §163(d)(5)(A)(i): ordinary investment interest (margin, investor-fund K-1 Box 13, 1099-INT Box 5, short-dividend substitute payments). The allowed amount is an itemized deduction on Schedule A, line 9 (via Form 4952).',
                sources: $scheduleASources,
            );
        }
        if ($grossScheduleE > 0.0) {
            $carryDestinations[] = new Form4952CarryDestination(
                destination: 'sch-e',
                label: 'Schedule E, Part II, line 28 — above-the-line (trader fund)',
                formLine: 'Schedule E, Part II, line 28',
                grossInterest: $grossScheduleE,
                allowedDeduction: $deductibleScheduleE,
                carryforward: $carryforwardScheduleE,
                share: $totalInvestmentInterestExpense > 0.0 ? round($grossScheduleE / $totalInvestmentInterestExpense, 6) : 0.0,
                citation: "IRC §163(d)(5)(A)(ii): a non-materially-participating partner's share of a securities-trading partnership's interest. NII-limited like other investment interest, but the allowed amount is deducted above-the-line on Schedule E, Part II, line 28 (§62(a)(1); Rev. Rul. 2008-12 & 2008-38; Announcement 2008-65).",
                sources: $scheduleESources,
            );
        }

        return new Form4952Facts(
            investmentInterestSources: $investmentInterestSources,
            totalInvestmentInterestExpense: $totalInvestmentInterestExpense,
            investmentExpenseSources: $investmentExpenseSources,
            totalInvestmentExpenses: $totalInvestmentExpenses,
            excludedInvestmentExpenseSources: $excludedInvestmentExpenseSources,
            totalExcludedInvestmentExpenses: $totalExcludedInvestmentExpenses,
            materialParticipationScheduleEInterestSources: $materialParticipationScheduleEInterestSources,
            totalMaterialParticipationScheduleEInterest: $totalMaterialParticipationScheduleEInterest,
            grossInvestmentIncomeFromScheduleB: $grossInvestmentIncomeFromScheduleB,
            grossInvestmentIncomeFromK1: $grossInvestmentIncomeFromK1,
            grossInvestmentIncomeTotal: $grossInvestmentIncomeTotal,
            line4cNetInvestmentIncomeAfterQualifiedDividends: $line4c,
            netInvestmentIncomeBeforeQualifiedDividendElection: $niiBefore,
            totalQualifiedDividends: $totalQualifiedDividends,
            deductibleInvestmentInterestExpense: $deductible,
            disallowedCarryforward: $carryforward,
            grossInvestmentIncomeFromK1Sources: $grossInvestmentIncomeFromK1Sources,
            qualifiedDividendSources: $qualifiedDividendSources,
            deductibleScheduleEAboveLine: $deductibleScheduleE,
            deductibleScheduleAItemized: $deductibleScheduleA,
            carryforwardScheduleE: $carryforwardScheduleE,
            carryforwardScheduleA: $carryforwardScheduleA,
            carryDestinations: $carryDestinations,
            allocationMethod: $hasTracingSplits ? 'tracing' : 'pro_rata',
            allocationMethodDescription: $hasTracingSplits
                ? 'Tracing inputs under Treas. Reg. §1.163-8T set the §163(d)(5)(A) category gross amounts by use of debt proceeds; the Form 4952 allowed deduction and carryforward still reconcile to the aggregate §163(d) limit.'
                : 'Pro-rata allocation under Rev. Rul. 2008-38 using each category share of gross Form 4952 line-1 investment interest.',
            tracingSplitSources: $tracingSplitSources,
        );
    }

    /**
     * @param  TaxFactSource[]  $investmentInterestSources
     * @param  string[]  $scheduleESourceIds
     * @param  array<string, array{scheduleA:float,scheduleE:float}>  $tracingSplitsBySourceId
     * @return array{scheduleASources:TaxFactSource[],scheduleESources:TaxFactSource[],grossScheduleA:float,grossScheduleE:float,tracingSplitSources:Form4952TracingSplit[],hasTracingSplits:bool}
     */
    private function allocateInvestmentInterestSources(array $investmentInterestSources, array $scheduleESourceIds, array $tracingSplitsBySourceId): array
    {
        $scheduleASources = [];
        $scheduleESources = [];
        $tracingSplitSources = [];
        $grossScheduleA = 0.0;
        $grossScheduleE = 0.0;
        $hasTracingSplits = false;

        foreach ($investmentInterestSources as $source) {
            $grossInterest = abs($source->amount);
            if ($grossInterest === 0.0) {
                continue;
            }

            $tracingSplit = $tracingSplitsBySourceId[$source->id] ?? null;
            if ($tracingSplit !== null) {
                $hasTracingSplits = true;
                $inputTotal = $this->sumMoney([$tracingSplit['scheduleA'], $tracingSplit['scheduleE']]);
                $inputTotalCents = MoneyMath::toCents($inputTotal);
                $scheduleAInputCents = MoneyMath::toCents($tracingSplit['scheduleA']);
                if ($inputTotalCents > 0) {
                    $split = MoneyMath::allocateRatio($grossInterest, $scheduleAInputCents, $inputTotalCents);
                    $scheduleAGross = $split['allocated'];
                    $scheduleEGross = $split['remainder'];
                } else {
                    $scheduleAGross = 0.0;
                    $scheduleEGross = 0.0;
                }

                $tracingSplitSources[] = new Form4952TracingSplit(
                    sourceId: $source->id,
                    label: $source->label,
                    grossInterest: $this->roundMoney($grossInterest),
                    scheduleAInterest: $this->roundMoney($scheduleAGross),
                    scheduleEInterest: $this->roundMoney($scheduleEGross),
                    scheduleAShare: $grossInterest > 0.0 ? round($scheduleAGross / $grossInterest, 6) : 0.0,
                    scheduleEShare: $grossInterest > 0.0 ? round($scheduleEGross / $grossInterest, 6) : 0.0,
                    taxDocumentId: $source->taxDocumentId,
                    formType: $source->formType,
                    box: $source->box,
                    code: $source->code,
                );
            } elseif (in_array($source->id, $scheduleESourceIds, true)) {
                $scheduleAGross = 0.0;
                $scheduleEGross = $grossInterest;
            } else {
                $scheduleAGross = $grossInterest;
                $scheduleEGross = 0.0;
            }

            if ($scheduleAGross > 0.0) {
                $grossScheduleA = $this->sumMoney([$grossScheduleA, $scheduleAGross]);
                $scheduleASources[] = $this->sourceSlice(
                    $source,
                    'schedule-a',
                    $scheduleAGross,
                    TaxFactRouting::ScheduleALine9,
                    'This source or traced slice is §163(d)(5)(A)(i) investment interest; the allowed amount is itemized on Schedule A line 9.',
                );
            }

            if ($scheduleEGross > 0.0) {
                $grossScheduleE = $this->sumMoney([$grossScheduleE, $scheduleEGross]);
                $scheduleESources[] = $this->sourceSlice(
                    $source,
                    'schedule-e',
                    $scheduleEGross,
                    TaxFactRouting::ScheduleELine28,
                    'This source or traced slice is §163(d)(5)(A)(ii) non-materially-participating trader-partnership interest; the allowed amount is deducted above the line on Schedule E Part II line 28.',
                );
            }
        }

        return [
            'scheduleASources' => $scheduleASources,
            'scheduleESources' => $scheduleESources,
            'grossScheduleA' => $this->roundMoney($grossScheduleA),
            'grossScheduleE' => $this->roundMoney($grossScheduleE),
            'tracingSplitSources' => $tracingSplitSources,
            'hasTracingSplits' => $hasTracingSplits,
        ];
    }

    private function sourceSlice(TaxFactSource $source, string $suffix, float $grossInterest, TaxFactRouting $routing, string $routingReason): TaxFactSource
    {
        return new TaxFactSource(
            id: "{$source->id}-{$suffix}",
            label: $source->label,
            amount: $this->roundMoney(-abs($grossInterest)),
            sourceType: TaxFactSourceType::from($source->sourceType),
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

    /**
     * Per-K-1 contribution to Form 4952 line 4a (gross investment income), as navigable
     * sources. The summed total equals the previous scalar computation.
     *
     * @param  FileForTaxDocument[]  $k1Docs
     * @return TaxFactSource[]
     */
    private function k1Form4952GrossInvestmentIncomeSources(array $k1Docs): array
    {
        $sources = [];

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $box20A = $this->sumK1CodeItems($data, '20', 'A');
            if ($box20A !== 0.0) {
                $amount = $box20A;
                $box = '20';
                $code = 'A';
                $basis = 'Box 20A — partnership-reported investment income.';
            } else {
                $amount = $this->sumMoney([
                    $this->k1Field($data, '5'),
                    $this->k1Field($data, '6a'),
                    -$this->k1Field($data, '6b'),
                    $this->sumK1CodeItems($data, '11', 'C'),
                ]);
                $box = null;
                $code = null;
                $basis = 'Box 5 interest + Box 6a ordinary dividends − Box 6b qualified dividends + Box 11C other portfolio income.';
            }

            $amount = $this->roundMoney($amount);
            if ($amount === 0.0) {
                continue;
            }

            $sources[] = new TaxFactSource(
                id: "k1-{$doc->id}-form4952-line4a",
                label: $this->k1PartnerName($doc, $data),
                amount: $amount,
                sourceType: TaxFactSourceType::K1Form4952GrossInvestmentIncome,
                taxDocumentId: $doc->id,
                formType: $this->formType($doc),
                box: $box,
                code: $code,
                routing: TaxFactRouting::Form4952Line4a,
                routingReason: 'K-1 investment income feeds Form 4952 line 4a (gross investment income), excluding net capital gain.',
                notes: $basis,
                isReviewed: $this->sourceIsReviewed($doc),
                reviewStatus: $this->reviewStatus($doc),
                reviewAction: $this->reviewAction($doc),
            );
        }

        return $sources;
    }

    /**
     * Sources comprising Form 4952 line 4b (qualified dividends included in line 4a).
     * Mirrors form4952QualifiedDividendsIncludedInGross: all direct 1099-DIV qualified
     * dividends, plus K-1 Box 6b only for K-1s whose Box 20A feeds line 4a.
     *
     * @param  FileForTaxDocument[]  $k1Docs
     * @return TaxFactSource[]
     */
    private function form4952QualifiedDividendSources(array $k1Docs, ScheduleBFacts $scheduleB): array
    {
        $docIdsWithBox20A = [];
        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data !== null && $this->sumK1CodeItems($data, '20', 'A') !== 0.0) {
                $docIdsWithBox20A[$doc->id] = true;
            }
        }

        $sources = [];
        foreach ($scheduleB->qualifiedDividendSources as $source) {
            if ($source->sourceType === TaxFactSourceType::Form1099DivQualifiedDividends->value) {
                $sources[] = $source;

                continue;
            }

            if ($source->sourceType === TaxFactSourceType::K1QualifiedDividends->value
                && $source->taxDocumentId !== null
                && isset($docIdsWithBox20A[$source->taxDocumentId])) {
                $sources[] = $source;
            }
        }

        return $sources;
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     */
    private function form4952QualifiedDividendsIncludedInGross(array $k1Docs, ScheduleBFacts $scheduleB): float
    {
        $directQualifiedDividends = $this->sumSourcesByTypes($scheduleB->qualifiedDividendSources, [TaxFactSourceType::Form1099DivQualifiedDividends]);
        $k1QualifiedDividendsIncludedInBox20A = 0.0;

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null || $this->sumK1CodeItems($data, '20', 'A') === 0.0) {
                continue;
            }

            $k1QualifiedDividendsIncludedInBox20A = $this->sumMoney([$k1QualifiedDividendsIncludedInBox20A, $this->k1Field($data, '6b')]);
        }

        return $this->sumMoney([$directQualifiedDividends, $k1QualifiedDividendsIncludedInBox20A]);
    }

    /**
     * @param  array<string, mixed>  $item
     */
    private function box13InvestmentInterestNotes(array $item, float $rawAmount): ?string
    {
        $notes = is_string($item['notes'] ?? null) ? $item['notes'] : null;
        if ($rawAmount <= 0.0) {
            return $notes;
        }

        $warning = 'Reported as a positive K-1 Box 13 amount; total expense uses the absolute value.';

        return $notes !== null && $notes !== '' ? "{$notes} {$warning}" : $warning;
    }
}
