<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\TaxPreviewFacts\Data\Form1040Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form6251Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8960Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8995Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Schedule1Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Schedule3Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleAFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleBFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleDFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleSEFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use App\Support\Finance\FederalIncomeTax;

class Form1040FactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  FileForTaxDocument[]  $w2Docs
     * @param  FileForTaxDocument[]  $docs1099
     */
    public function build(
        array $w2Docs,
        array $docs1099,
        ScheduleBFacts $scheduleB,
        Schedule1Facts $schedule1,
        ScheduleAFacts $scheduleA,
        ScheduleDFacts $scheduleD,
        Schedule3Facts $schedule3,
        ScheduleSEFacts $scheduleSE,
        Form8995Facts $form8995,
        Form6251Facts $form6251,
        Form8960Facts $form8960,
        int $year,
        bool $isMarried,
    ): Form1040Facts {
        $line1zSources = $this->w2Sources($w2Docs, 'box1_wages', TaxFactSourceType::W2Wages, TaxFactRouting::Form1040Line1z, 'W-2 Box 1 wages flow to Form 1040 line 1z.');
        $line2aSources = $this->taxExemptInterestSources($docs1099);
        $line4Sources = $this->retirementDistributionSources($docs1099, true);
        $line5Sources = $this->retirementDistributionSources($docs1099, false);
        $line7Sources = $this->line7Sources($scheduleD);
        $line8Sources = [
            ...$schedule1->line3Sources,
            ...$schedule1->line4Sources,
            ...$schedule1->line5Sources,
            ...$schedule1->line6Sources,
            ...$schedule1->line8Sources,
        ];
        $line10Sources = $schedule1->line15Sources;
        $line12 = $this->line12Deduction($scheduleA, $isMarried);
        $line12Sources = [
            $this->source(
                'form1040-line12-deduction',
                $line12['source'] === 'itemized_deductions' ? 'Schedule A itemized deductions' : 'Standard deduction',
                $line12['amount'],
                $line12['source'] === 'itemized_deductions' ? TaxFactSourceType::Form1040ScheduleA : TaxFactSourceType::Form1040ScheduleA,
                TaxFactRouting::Form1040Line12,
                $line12['source'] === 'itemized_deductions' ? 'Schedule A itemized deductions exceed the filing-status standard deduction.' : 'The filing-status standard deduction is greater than itemized deductions.',
            ),
        ];
        $line13Sources = $form8995->deduction !== 0.0 ? [
            $this->source(
                'form1040-line13-form8995',
                'Form 8995 qualified business income deduction',
                $form8995->deduction,
                TaxFactSourceType::Form1040Form8995QbiDeduction,
                TaxFactRouting::Form1040Line13,
                'Form 8995 deduction flows to Form 1040 line 13.',
            ),
        ] : [];

        $line1z = $this->sumSources($line1zSources);
        $line2a = $this->sumSources($line2aSources);
        $line2b = $scheduleB->interestTotal;
        $line3a = $scheduleB->qualifiedDividendTotal;
        $line3b = $scheduleB->ordinaryDividendTotal;
        $line4a = $this->sumSources($line4Sources['gross']);
        $line4b = $this->sumSources($line4Sources['taxable']);
        $line5a = $this->sumSources($line5Sources['gross']);
        $line5b = $this->sumSources($line5Sources['taxable']);
        $line6a = 0.0;
        $line6b = 0.0;
        $line7 = $scheduleD->line21LimitedLossOrGain !== 0.0 ? $scheduleD->line21LimitedLossOrGain : $scheduleD->line16Combined;
        $line8 = $this->sumMoney([
            $schedule1->line3Total,
            $schedule1->line4Total,
            $schedule1->line5Total,
            $schedule1->line6Total,
            $schedule1->line9TotalOtherIncome,
        ]);
        $line9 = $this->sumMoney([$line1z, $line2b, $line3b, $line4b, $line5b, $line6b, $line7, $line8]);
        $line10 = $schedule1->line15Total;
        $line11 = $this->subtractMoney($line9, $line10);
        $line13 = $form8995->deduction;
        $line14 = $this->sumMoney([$line12['amount'], $line13]);
        $line15 = max(0.0, $this->subtractMoney($line11, $line14));
        $preferentialCapitalGain = $this->preferentialCapitalGain($scheduleD);
        $line16 = FederalIncomeTax::regularTax($line15, $year, $isMarried, $line3a, $preferentialCapitalGain);
        $line16Computation = $line3a > 0.0 || $preferentialCapitalGain > 0.0 ? 'qualified_dividends_capital_gain' : 'ordinary_brackets';
        $line16Sources = [
            $this->source(
                'form1040-line16-federal-tax',
                'Federal regular tax',
                $line16,
                TaxFactSourceType::Form1040FederalTax,
                TaxFactRouting::Form1040Line16,
                $line16Computation === 'qualified_dividends_capital_gain'
                    ? 'Computed with qualified-dividend and long-term-capital-gain stacking.'
                    : 'Computed with ordinary federal tax brackets.',
                "Taxable income {$line15}; qualified dividends {$line3a}; preferential capital gain {$preferentialCapitalGain}.",
            ),
        ];
        $line17Sources = $form6251->amt !== 0.0 ? [
            $this->source('form1040-line17-form6251', 'Form 6251 alternative minimum tax', $form6251->amt, TaxFactSourceType::Form1040Schedule2, TaxFactRouting::Form1040Line17, 'Form 6251 AMT flows through Schedule 2 Part I to Form 1040 line 17.'),
        ] : [];
        $line17 = $form6251->amt;
        $line18 = $this->sumMoney([$line16, $line17]);
        $line19 = 0.0;
        $line20Sources = [
            ...$schedule3->line1Sources,
            ...$schedule3->line2Sources,
            ...$schedule3->line3Sources,
            ...$schedule3->line4Sources,
            ...$schedule3->line5aSources,
            ...$schedule3->line5bSources,
            ...$schedule3->line6Sources,
        ];
        $line20 = $schedule3->line8TotalNonrefundableCredits;
        $line21 = $this->sumMoney([$line19, $line20]);
        $line22 = max(0.0, $this->subtractMoney($line18, $line21));
        $line23Sources = $this->line23Sources($scheduleSE, $form8960, $isMarried);
        $line23 = $this->sumSources($line23Sources);
        $line24 = $this->sumMoney([$line22, $line23]);
        $line25aSources = $this->w2Sources($w2Docs, 'box2_fed_tax', TaxFactSourceType::W2FederalWithholding, TaxFactRouting::Form1040Line25a, 'W-2 Box 2 federal income tax withheld flows to Form 1040 line 25a.');
        $line25bSources = $this->federal1099WithholdingSources($docs1099);
        $line25cSources = [];
        $line25a = $this->sumSources($line25aSources);
        $line25b = $this->sumSources($line25bSources);
        $line25c = 0.0;
        $line25d = $this->sumMoney([$line25a, $line25b, $line25c]);
        $line26Sources = [];
        $line26 = 0.0;
        $line31Sources = [
            ...$schedule3->line9Sources,
            ...$schedule3->line10Sources,
            ...$schedule3->line11Sources,
            ...$schedule3->line12Sources,
            ...$schedule3->line13Sources,
        ];
        $line31 = $schedule3->line15TotalPaymentsRefundableCredits;
        $line32 = $line31;
        $line33 = $this->sumMoney([$line25d, $line26, $line32]);
        $line34 = max(0.0, $this->subtractMoney($line33, $line24));
        $line35a = $line34;
        $line36 = 0.0;
        $line37 = max(0.0, $this->subtractMoney($line24, $line33));
        $line38 = 0.0;

        return new Form1040Facts(
            filingStatus: $isMarried ? 'mfj' : 'single',
            line1zSources: $line1zSources,
            line1z: $line1z,
            line2aSources: $line2aSources,
            line2a: $line2a,
            line2bSources: $scheduleB->interestSources,
            line2b: $line2b,
            line3aSources: $scheduleB->qualifiedDividendSources,
            line3a: $line3a,
            line3bSources: $scheduleB->ordinaryDividendSources,
            line3b: $line3b,
            line4aSources: $line4Sources['gross'],
            line4a: $line4a,
            line4bSources: $line4Sources['taxable'],
            line4b: $line4b,
            line5aSources: $line5Sources['gross'],
            line5a: $line5a,
            line5bSources: $line5Sources['taxable'],
            line5b: $line5b,
            line6aSources: [],
            line6a: $line6a,
            line6bSources: [],
            line6b: $line6b,
            line7Sources: $line7Sources,
            line7: $line7,
            line8Sources: $line8Sources,
            line8: $line8,
            line9: $line9,
            line10Sources: $line10Sources,
            line10: $line10,
            line11: $line11,
            line12Source: $line12['source'],
            line12Sources: $line12Sources,
            line12: $line12['amount'],
            line13Sources: $line13Sources,
            line13: $line13,
            line14: $line14,
            line15: $line15,
            line16TaxComputation: $line16Computation,
            line16Sources: $line16Sources,
            line16: $line16,
            line17Sources: $line17Sources,
            line17: $line17,
            line18: $line18,
            line19: $line19,
            line20Sources: $line20Sources,
            line20: $line20,
            line21: $line21,
            line22: $line22,
            line23Sources: $line23Sources,
            line23: $line23,
            line24: $line24,
            line25aSources: $line25aSources,
            line25a: $line25a,
            line25bSources: $line25bSources,
            line25b: $line25b,
            line25cSources: $line25cSources,
            line25c: $line25c,
            line25d: $line25d,
            line26Sources: $line26Sources,
            line26: $line26,
            line31Sources: $line31Sources,
            line31: $line31,
            line32: $line32,
            line33: $line33,
            line34: $line34,
            line35a: $line35a,
            line36: $line36,
            line37: $line37,
            line38: $line38,
        );
    }

    public function regularTax(ScheduleBFacts $scheduleB, ScheduleDFacts $scheduleD, float $taxableIncome, int $year, bool $isMarried): float
    {
        return FederalIncomeTax::regularTax($taxableIncome, $year, $isMarried, $scheduleB->qualifiedDividendTotal, $this->preferentialCapitalGain($scheduleD));
    }

    /**
     * @param  FileForTaxDocument[]  $docs
     * @return TaxFactSource[]
     */
    private function w2Sources(array $docs, string $field, TaxFactSourceType $sourceType, TaxFactRouting $routing, string $routingReason): array
    {
        $sources = [];

        foreach ($docs as $doc) {
            if (! is_array($doc->parsed_data)) {
                continue;
            }

            $amount = $this->firstNumericValue($doc->parsed_data, [$field]);
            if ($amount === null || $amount === 0.0) {
                continue;
            }

            $sources[] = new TaxFactSource(
                id: "doc-{$doc->id}-{$routing->value}",
                label: $this->w2Label($doc, $doc->parsed_data),
                amount: $amount,
                sourceType: $sourceType,
                taxDocumentId: $doc->id,
                formType: $this->formType($doc),
                box: $field === 'box1_wages' ? '1' : '2',
                routing: $routing,
                routingReason: $routingReason,
                isReviewed: $this->sourceIsReviewed($doc),
                reviewStatus: $this->reviewStatus($doc),
                reviewAction: $this->reviewAction($doc),
            );
        }

        return $sources;
    }

    /**
     * @param  FileForTaxDocument[]  $docs
     * @return TaxFactSource[]
     */
    private function taxExemptInterestSources(array $docs): array
    {
        $sources = [];

        foreach ($docs as $doc) {
            foreach ($this->documentEntriesForFormTypes($doc, ['1099_int', '1099_int_c']) as $entry) {
                $amount = $this->firstNumericOrNestedValue($entry['parsedData'], ['box8_tax_exempt', 'int_8_tax_exempt_interest'], ['8_tax_exempt_interest']);
                if ($amount !== null && $amount !== 0.0) {
                    $sources[] = $this->documentSource($doc, $entry['link'], '1099-INT tax-exempt interest', $amount, TaxFactSourceType::Form1099IntTaxExemptInterest, TaxFactRouting::Form1040Line2a, '1099-INT Box 8 tax-exempt interest flows to Form 1040 line 2a.', '1099_int', '8', $entry['parsedData']);
                }
            }

            foreach ($this->documentEntriesForFormTypes($doc, ['1099_div', '1099_div_c']) as $entry) {
                $amount = $this->firstNumericOrNestedValue($entry['parsedData'], ['box11_exempt_interest', 'div_11_exempt_interest_dividends'], ['11_exempt_interest_dividends']);
                if ($amount !== null && $amount !== 0.0) {
                    $sources[] = $this->documentSource($doc, $entry['link'], '1099-DIV exempt-interest dividends', $amount, TaxFactSourceType::Form1099DivTaxExemptInterest, TaxFactRouting::Form1040Line2a, '1099-DIV Box 11 exempt-interest dividends flow to Form 1040 line 2a.', '1099_div', '11', $entry['parsedData']);
                }
            }
        }

        return $sources;
    }

    /**
     * @param  FileForTaxDocument[]  $docs
     * @return array{gross: TaxFactSource[], taxable: TaxFactSource[]}
     */
    private function retirementDistributionSources(array $docs, bool $ira): array
    {
        $grossSources = [];
        $taxableSources = [];

        foreach ($docs as $doc) {
            foreach ($this->documentEntriesForFormTypes($doc, ['1099_r']) as $entry) {
                $parsedData = $entry['parsedData'];
                if ($this->isIraDistribution($parsedData) !== $ira) {
                    continue;
                }

                $gross = $this->firstNumericValue($parsedData, ['box1_gross_distribution', 'gross_distribution']) ?? 0.0;
                $taxable = $this->firstNumericValue($parsedData, ['box2a_taxable_amount', 'taxable_amount']) ?? $gross;
                $label = $this->payerName($doc, $entry['link'], $parsedData);

                if ($gross !== 0.0) {
                    $grossSources[] = $this->documentSource(
                        $doc,
                        $entry['link'],
                        $label,
                        $gross,
                        $ira ? TaxFactSourceType::Form1099RGrossIraDistribution : TaxFactSourceType::Form1099RGrossPensionDistribution,
                        $ira ? TaxFactRouting::Form1040Line4a : TaxFactRouting::Form1040Line5a,
                        $ira ? '1099-R IRA gross distributions flow to Form 1040 line 4a.' : '1099-R pension and annuity gross distributions flow to Form 1040 line 5a.',
                        '1099_r',
                        '1',
                        $parsedData,
                    );
                }

                if ($taxable !== 0.0) {
                    $taxableSources[] = $this->documentSource(
                        $doc,
                        $entry['link'],
                        $label,
                        $taxable,
                        $ira ? TaxFactSourceType::Form1099RTaxableIraDistribution : TaxFactSourceType::Form1099RTaxablePensionDistribution,
                        $ira ? TaxFactRouting::Form1040Line4b : TaxFactRouting::Form1040Line5b,
                        $ira ? '1099-R taxable IRA distributions flow to Form 1040 line 4b.' : '1099-R taxable pension and annuity distributions flow to Form 1040 line 5b.',
                        '1099_r',
                        '2a',
                        $parsedData,
                    );
                }
            }
        }

        return ['gross' => $grossSources, 'taxable' => $taxableSources];
    }

    /**
     * @param  FileForTaxDocument[]  $docs
     * @return TaxFactSource[]
     */
    private function federal1099WithholdingSources(array $docs): array
    {
        $sources = [];

        foreach ($docs as $doc) {
            foreach ($this->documentEntriesForFormTypes($doc, ['1099_int', '1099_int_c', '1099_div', '1099_div_c', '1099_misc', '1099_nec', '1099_r']) as $entry) {
                $amount = $this->firstNumericValue($entry['parsedData'], ['box4_fed_tax', 'fed_tax_withheld', 'federal_tax_withheld']);
                if ($amount === null || $amount === 0.0) {
                    continue;
                }

                $formType = $entry['link'] instanceof TaxDocumentAccount
                    ? $entry['link']->form_type
                    : $this->formType($doc);
                $sources[] = $this->documentSource(
                    $doc,
                    $entry['link'],
                    "{$this->payerName($doc, $entry['link'], $entry['parsedData'])} — federal tax withheld",
                    $amount,
                    $formType === '1099_r' ? TaxFactSourceType::Form1099RFederalWithholding : TaxFactSourceType::Form1099FederalWithholding,
                    TaxFactRouting::Form1040Line25b,
                    '1099 Box 4 federal income tax withheld flows to Form 1040 line 25b.',
                    $formType,
                    '4',
                    $entry['parsedData'],
                );
            }
        }

        return $sources;
    }

    /**
     * @return TaxFactSource[]
     */
    private function line7Sources(ScheduleDFacts $scheduleD): array
    {
        if ($scheduleD->line16Combined === 0.0 && $scheduleD->line21LimitedLossOrGain === 0.0) {
            return [];
        }

        return [
            $this->source(
                'schedule-d-form1040-line7',
                'Schedule D capital gain or loss',
                $scheduleD->line21LimitedLossOrGain !== 0.0 ? $scheduleD->line21LimitedLossOrGain : $scheduleD->line16Combined,
                TaxFactSourceType::Form1040ScheduleD,
                TaxFactRouting::Form1040Line7,
                'Schedule D line 21, or line 16 when no limitation applies, flows to Form 1040 line 7.',
                "Schedule D line 16 {$scheduleD->line16Combined}; line 21 {$scheduleD->line21LimitedLossOrGain}.",
            ),
        ];
    }

    /**
     * @return TaxFactSource[]
     */
    private function line23Sources(ScheduleSEFacts $scheduleSE, Form8960Facts $form8960, bool $isMarried): array
    {
        $sources = [];

        if ($scheduleSE->seTax !== 0.0) {
            $sources[] = $this->source('schedule-se-form1040-line23', 'Schedule SE self-employment tax', $scheduleSE->seTax, TaxFactSourceType::Form1040Schedule2, TaxFactRouting::Form1040Line23, 'Schedule SE self-employment tax flows through Schedule 2 Part II to Form 1040 line 23.');
        }

        if ($scheduleSE->additionalMedicareTax !== 0.0) {
            $sources[] = $this->source('schedule-se-additional-medicare-form1040-line23', 'Additional Medicare tax on self-employment earnings', $scheduleSE->additionalMedicareTax, TaxFactSourceType::Form1040Schedule2, TaxFactRouting::Form1040Line23, 'Additional Medicare tax flows through Schedule 2 Part II to Form 1040 line 23.');
        }

        $niit = $isMarried ? $form8960->niitTaxMarriedFilingJointly : $form8960->niitTaxSingle;
        if ($niit !== null && $niit !== 0.0) {
            $sources[] = $this->source('form8960-form1040-line23', 'Form 8960 net investment income tax', $niit, TaxFactSourceType::Form1040Schedule2, TaxFactRouting::Form1040Line23, 'Form 8960 NIIT flows through Schedule 2 Part II to Form 1040 line 23.');
        }

        return $sources;
    }

    /**
     * @return array{amount: float, source: string}
     */
    private function line12Deduction(ScheduleAFacts $scheduleA, bool $isMarried): array
    {
        $shouldItemize = $isMarried ? $scheduleA->shouldItemizeMarriedFilingJointly : $scheduleA->shouldItemizeSingle;

        return [
            'amount' => $shouldItemize
                ? $scheduleA->totalItemizedDeductions
                : ($isMarried ? $scheduleA->standardDeductionMarriedFilingJointly : $scheduleA->standardDeductionSingle),
            'source' => $shouldItemize ? 'itemized_deductions' : 'standard_deduction',
        ];
    }

    private function preferentialCapitalGain(ScheduleDFacts $scheduleD): float
    {
        return max(0.0, min($scheduleD->line15NetLongTerm, $scheduleD->line16Combined));
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function isIraDistribution(array $parsedData): bool
    {
        $distributionType = strtolower(trim((string) ($parsedData['distribution_type'] ?? '')));
        if ($distributionType !== '') {
            $looksLikeIra = str_contains($distributionType, 'ira') || str_contains($distributionType, 'sep') || str_contains($distributionType, 'simple');
            $looksLikePension = str_contains($distributionType, 'pension') || str_contains($distributionType, 'annuity');

            if ($looksLikeIra && ! $looksLikePension) {
                return true;
            }

            if ($looksLikePension && ! $looksLikeIra) {
                return false;
            }
        }

        return (bool) ($parsedData['box7_ira_sep_simple'] ?? false);
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function w2Label(FileForTaxDocument $doc, array $parsedData): string
    {
        $employer = $parsedData['employer_name'] ?? null;
        if (is_string($employer) && trim($employer) !== '') {
            return $employer;
        }

        $entity = $doc->employmentEntity;

        return ($entity instanceof FinEmploymentEntity ? $entity->display_name : null)
            ?? $doc->original_filename
            ?? 'W-2';
    }

    /**
     * @param  string[]  $formTypes
     * @return array<int, array{parsedData: array<string, mixed>, link: ?TaxDocumentAccount}>
     */
    private function documentEntriesForFormTypes(FileForTaxDocument $doc, array $formTypes): array
    {
        $entries = [];

        if ($doc->accountLinks->isNotEmpty()) {
            foreach ($doc->accountLinks as $link) {
                if (! $link instanceof TaxDocumentAccount || ! in_array($link->form_type, $formTypes, true)) {
                    continue;
                }

                $parsedData = $this->parsedDataForLink($doc, $link);
                if ($parsedData !== null) {
                    $entries[] = ['parsedData' => $parsedData, 'link' => $link];
                }
            }

            return $entries;
        }

        if (in_array($this->formType($doc), $formTypes, true) && is_array($doc->parsed_data)) {
            $entries[] = ['parsedData' => $doc->parsed_data, 'link' => null];
        }

        return $entries;
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function documentSource(FileForTaxDocument $doc, ?TaxDocumentAccount $link, string $label, float $amount, TaxFactSourceType $sourceType, TaxFactRouting $routing, string $routingReason, string $formType, string $box, array $parsedData): TaxFactSource
    {
        return new TaxFactSource(
            id: $link instanceof TaxDocumentAccount ? "link-{$link->id}-{$routing->value}" : "doc-{$doc->id}-{$routing->value}",
            label: $label === '' ? $this->payerName($doc, $link, $parsedData) : $label,
            amount: $amount,
            sourceType: $sourceType,
            taxDocumentId: $doc->id,
            taxDocumentAccountId: $link?->id,
            accountId: $link?->account_id,
            formType: $formType,
            box: $box,
            routing: $routing,
            routingReason: $routingReason,
            isReviewed: $this->sourceIsReviewed($doc, $link),
            reviewStatus: $this->reviewStatus($doc, $link),
            reviewAction: $this->reviewAction($doc, $link),
        );
    }

    private function source(string $id, string $label, float $amount, TaxFactSourceType $sourceType, TaxFactRouting $routing, string $routingReason, ?string $notes = null): TaxFactSource
    {
        return new TaxFactSource(
            id: $id,
            label: $label,
            amount: $amount,
            sourceType: $sourceType,
            routing: $routing,
            routingReason: $routingReason,
            notes: $notes,
        );
    }
}
