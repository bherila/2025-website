<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\TaxPreviewFacts\Data\Form8995EntityFact;
use App\Services\Finance\TaxPreviewFacts\Data\Form8995Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleCFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleDFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleEFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleSEFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class Form8995FactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  FileForTaxDocument[]  $k1Docs
     */
    public function build(
        array $k1Docs,
        ScheduleCFacts $scheduleC,
        ScheduleEFacts $scheduleE,
        ScheduleSEFacts $scheduleSE,
        ScheduleDFacts $scheduleD,
        float $taxableIncomeBeforeQbi,
        int $year,
        bool $isMarried,
    ): Form8995Facts {
        $entities = [
            ...$this->scheduleCEntities($scheduleC, $scheduleSE),
            ...$this->scheduleEEntities($scheduleE),
            ...$this->k1Entities($k1Docs),
        ];

        $line1Sources = [];
        $line6Sources = [];
        foreach ($entities as $entity) {
            $line1Sources = [...$line1Sources, ...array_filter(
                $entity->sources,
                static fn (TaxFactSource $source): bool => in_array($source->routing, [TaxFactRouting::Form8995Line1->value, TaxFactRouting::Form8995Line5->value], true),
            )];
            $line6Sources = [...$line6Sources, ...array_filter(
                $entity->sources,
                static fn (TaxFactSource $source): bool => in_array($source->routing, [TaxFactRouting::Form8995Line6->value, TaxFactRouting::Form8995Line9->value], true),
            )];
        }

        $totalQbi = $this->sumMoney(array_map(static fn (Form8995EntityFact $entity): float => $entity->qbiIncome, $entities));
        $totalQbiComponent = $this->roundMoney(max(0.0, $totalQbi) * 0.2);
        $qualifiedReitDividends = $this->sumMoney(array_map(static fn (Form8995EntityFact $entity): float => $entity->reitDividends, $entities));
        $qualifiedPtpIncome = $this->sumMoney(array_map(static fn (Form8995EntityFact $entity): float => $entity->ptpIncome, $entities));
        $reitPtpComponent = $this->roundMoney(max(0.0, $this->sumMoney([$qualifiedReitDividends, $qualifiedPtpIncome])) * 0.2);
        $netCapitalGain = max(0.0, $scheduleD->line16Combined);
        $taxableIncomeLessNetCapitalGain = max(0.0, $this->subtractMoney($taxableIncomeBeforeQbi, $netCapitalGain));
        $taxableIncomeCap = $this->roundMoney($taxableIncomeLessNetCapitalGain * 0.2);
        $thresholds = Form8995Facts::thresholds($year);
        $threshold = $isMarried ? $thresholds['mfj'] : $thresholds['single'];
        $aboveThreshold = $taxableIncomeBeforeQbi > $threshold;
        $deductionBeforeCap = $this->sumMoney([$totalQbiComponent, $reitPtpComponent]);
        $deduction = min($deductionBeforeCap, $taxableIncomeCap);

        return new Form8995Facts(
            entities: $entities,
            line1Sources: $line1Sources,
            totalQbi: $totalQbi,
            totalQbiComponent: $totalQbiComponent,
            line6Sources: $line6Sources,
            qualifiedReitDividends: $qualifiedReitDividends,
            qualifiedPtpIncome: $qualifiedPtpIncome,
            reitPtpComponent: $reitPtpComponent,
            taxableIncomeBeforeQbi: $taxableIncomeBeforeQbi,
            netCapitalGain: $netCapitalGain,
            taxableIncomeLessNetCapitalGain: $taxableIncomeLessNetCapitalGain,
            taxableIncomeCap: $taxableIncomeCap,
            deduction: $deduction,
            thresholdSingle: $thresholds['single'],
            thresholdMarriedFilingJointly: $thresholds['mfj'],
            aboveThreshold: $aboveThreshold,
            reviewSources: $aboveThreshold ? [$this->aboveThresholdSource($taxableIncomeBeforeQbi, $threshold, $deduction)] : [],
        );
    }

    /**
     * @return Form8995EntityFact[]
     */
    private function scheduleCEntities(ScheduleCFacts $scheduleC, ScheduleSEFacts $scheduleSE): array
    {
        if ($scheduleC->netProfit === 0.0) {
            return [];
        }

        $qbiIncome = $this->subtractMoney($scheduleC->netProfit, $scheduleSE->deductibleSeTax);

        return [
            new Form8995EntityFact(
                entityKey: 'schedule-c',
                label: 'Schedule C businesses',
                sourceKind: 'schedule_c',
                sources: [
                    new TaxFactSource(
                        id: 'schedule-c-form-8995-line1',
                        label: 'Schedule C net profit after half-SE-tax adjustment',
                        amount: $qbiIncome,
                        sourceType: TaxFactSourceType::Form8995ScheduleCQbi,
                        routing: TaxFactRouting::Form8995Line1,
                        routingReason: 'Schedule C QBI starts with line 31 and is reduced by deductible half of self-employment tax.',
                        notes: "Schedule C net {$scheduleC->netProfit}; deductible half SE tax {$scheduleSE->deductibleSeTax}.",
                    ),
                ],
                qbiIncome: $qbiIncome,
                reitDividends: 0.0,
                ptpIncome: 0.0,
                qbiComponent: $this->roundMoney(max(0.0, $qbiIncome) * 0.2),
            ),
        ];
    }

    /**
     * @return Form8995EntityFact[]
     */
    private function scheduleEEntities(ScheduleEFacts $scheduleE): array
    {
        if ($scheduleE->miscIncomeTotal === 0.0) {
            return [];
        }

        return [
            new Form8995EntityFact(
                entityKey: 'schedule-e-rental',
                label: 'Qualified Schedule E rental activities',
                sourceKind: 'schedule_e',
                sources: [
                    new TaxFactSource(
                        id: 'schedule-e-form-8995-line1',
                        label: 'Schedule E qualified rental income',
                        amount: $scheduleE->miscIncomeTotal,
                        sourceType: TaxFactSourceType::Form8995ScheduleEQbi,
                        routing: TaxFactRouting::Form8995Line1,
                        routingReason: 'Schedule E rental income marked as a Section 199A trade or business flows to Form 8995 line 1.',
                    ),
                ],
                qbiIncome: $scheduleE->miscIncomeTotal,
                reitDividends: 0.0,
                ptpIncome: 0.0,
                qbiComponent: $this->roundMoney(max(0.0, $scheduleE->miscIncomeTotal) * 0.2),
            ),
        ];
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @return Form8995EntityFact[]
     */
    private function k1Entities(array $k1Docs): array
    {
        $entities = [];

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            $statementA = is_array($data['statementA'] ?? null) ? $data['statementA'] : [];
            $sources = [
                ...$this->k1CodeSources($doc, $partnerName, $data, '17', 'V', TaxFactSourceType::Form8995K1Box17, TaxFactRouting::Form8995Line1, 'S corporation Section 199A QBI'),
                ...(array_key_exists('qualifiedBusinessIncome', $statementA) ? [] : $this->k1CodeSources($doc, $partnerName, $data, '20', 'Z', TaxFactSourceType::Form8995K1Box20Z, TaxFactRouting::Form8995Line1, 'partnership Section 199A QBI')),
                ...(array_key_exists('reitDividends', $statementA) ? [] : $this->k1CodeSources($doc, $partnerName, $data, '20', 'AA', TaxFactSourceType::Form8995K1Box20Aa, TaxFactRouting::Form8995Line6, 'qualified REIT dividends')),
                ...(array_key_exists('ptpIncome', $statementA) ? [] : $this->k1CodeSources($doc, $partnerName, $data, '20', 'AB', TaxFactSourceType::Form8995K1Box20Ab, TaxFactRouting::Form8995Line9, 'qualified PTP income')),
                ...(array_key_exists('reitDividends', $statementA) ? [] : $this->k1CodeSources($doc, $partnerName, $data, '20', 'AC', TaxFactSourceType::Form8995K1Box20Ac, TaxFactRouting::Form8995Line6, 'qualified REIT dividends')),
                ...(array_key_exists('ptpIncome', $statementA) ? [] : $this->k1CodeSources($doc, $partnerName, $data, '20', 'AD', TaxFactSourceType::Form8995K1Box20Ad, TaxFactRouting::Form8995Line9, 'qualified PTP income')),
            ];

            if ($statementA !== []) {
                $sources = [...$sources, ...$this->statementASources($doc, $partnerName, $statementA)];
            }

            if ($sources === []) {
                continue;
            }

            $qbiIncome = $this->sumSourcesByTypes($sources, [
                TaxFactSourceType::Form8995K1Box17,
                TaxFactSourceType::Form8995K1Box20Z,
            ]);
            $reitDividends = $this->sumSourcesByTypes($sources, [
                TaxFactSourceType::Form8995K1Box20Aa,
                TaxFactSourceType::Form8995K1Box20Ac,
                TaxFactSourceType::Form8995ReitDividends,
            ]);
            $ptpIncome = $this->sumSourcesByTypes($sources, [
                TaxFactSourceType::Form8995K1Box20Ab,
                TaxFactSourceType::Form8995K1Box20Ad,
                TaxFactSourceType::Form8995PtpIncome,
            ]);

            $entities[] = new Form8995EntityFact(
                entityKey: "k1-{$doc->id}",
                label: $partnerName,
                sourceKind: 'k1',
                sources: $sources,
                qbiIncome: $qbiIncome,
                reitDividends: $reitDividends,
                ptpIncome: $ptpIncome,
                qbiComponent: $this->roundMoney(max(0.0, $qbiIncome) * 0.2),
                isSstb: (bool) ($data['statementA']['isSstb'] ?? false),
                sectionNotes: $this->sectionNotes($data),
            );
        }

        return $entities;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return TaxFactSource[]
     */
    private function k1CodeSources(FileForTaxDocument $doc, string $partnerName, array $data, string $box, string $code, TaxFactSourceType $sourceType, TaxFactRouting $routing, string $label): array
    {
        $sources = [];

        foreach ($this->k1CodeItems($data, $box, $code) as $index => $item) {
            $amount = $this->parseMoney($item['value'] ?? null) ?? 0.0;
            if ($amount === 0.0) {
                continue;
            }

            $sources[] = new TaxFactSource(
                id: "k1-{$doc->id}-form-8995-box-{$box}{$code}-{$index}",
                label: "{$partnerName} — K-1 Box {$box}{$code} {$label}",
                amount: $amount,
                sourceType: $sourceType,
                taxDocumentId: $doc->id,
                formType: $this->formType($doc),
                box: $box,
                code: $code,
                routing: $routing,
                routingReason: 'Reviewed K-1 Section 199A code is routed to Form 8995 simplified QBI computation.',
                notes: is_string($item['notes'] ?? null) ? $item['notes'] : null,
                isReviewed: $this->sourceIsReviewed($doc),
                reviewStatus: $this->reviewStatus($doc),
                reviewAction: $this->reviewAction($doc),
            );
        }

        return $sources;
    }

    /**
     * @param  array<string, mixed>  $statementA
     * @return TaxFactSource[]
     */
    private function statementASources(FileForTaxDocument $doc, string $partnerName, array $statementA): array
    {
        $sources = [];
        foreach ([
            'qualifiedBusinessIncome' => [TaxFactSourceType::Form8995K1Box20Z, TaxFactRouting::Form8995Line1, 'Statement A QBI'],
            'reitDividends' => [TaxFactSourceType::Form8995ReitDividends, TaxFactRouting::Form8995Line6, 'Statement A REIT dividends'],
            'ptpIncome' => [TaxFactSourceType::Form8995PtpIncome, TaxFactRouting::Form8995Line9, 'Statement A PTP income'],
        ] as $field => [$sourceType, $routing, $label]) {
            $amount = $this->parseMoney($statementA[$field] ?? null) ?? 0.0;
            if ($amount === 0.0) {
                continue;
            }

            $sources[] = new TaxFactSource(
                id: "k1-{$doc->id}-form-8995-statement-a-{$field}",
                label: "{$partnerName} — {$label}",
                amount: $amount,
                sourceType: $sourceType,
                taxDocumentId: $doc->id,
                formType: $this->formType($doc),
                routing: $routing,
                routingReason: 'Structured K-1 Statement A Section 199A amount is preferred when available.',
                isReviewed: $this->sourceIsReviewed($doc),
                reviewStatus: $this->reviewStatus($doc),
                reviewAction: $this->reviewAction($doc),
            );
        }

        return $sources;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function sectionNotes(array $data): ?string
    {
        $notes = [];
        foreach ([['box' => '17', 'codes' => ['V']], ['box' => '20', 'codes' => ['Z', 'AA', 'AB', 'AC', 'AD']]] as $boxConfig) {
            foreach ($boxConfig['codes'] as $code) {
                $box = $boxConfig['box'];
                foreach ($this->k1CodeItems($data, $box, $code) as $item) {
                    if (is_string($item['notes'] ?? null) && trim($item['notes']) !== '') {
                        $notes[] = trim($item['notes']);
                    }
                }
            }
        }

        return $notes === [] ? null : implode("\n", $notes);
    }

    private function aboveThresholdSource(float $taxableIncomeBeforeQbi, float $threshold, float $deduction): TaxFactSource
    {
        return new TaxFactSource(
            id: 'form-8995-a-needs-review',
            label: 'Form 8995-A threshold review',
            amount: $deduction,
            sourceType: TaxFactSourceType::Form8995NeedsReview,
            routing: TaxFactRouting::Form8995Line13,
            routingReason: 'Taxable income before QBI deduction exceeds the simplified Form 8995 threshold; W-2 wage, UBIA, and SSTB limitations may apply on Form 8995-A.',
            notes: "Taxable income before QBI {$taxableIncomeBeforeQbi}; threshold {$threshold}.",
            isReviewed: false,
            reviewStatus: 'needs_review',
            reviewAction: 'Review Form 8995-A W-2 wage, UBIA, and SSTB limitations before filing.',
        );
    }
}
