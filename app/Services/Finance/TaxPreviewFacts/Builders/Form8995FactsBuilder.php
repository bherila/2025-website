<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\K1CodeCharacterResolver;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\TaxPreviewFacts\Data\Form8995AFacts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8995EntityFact;
use App\Services\Finance\TaxPreviewFacts\Data\Form8995Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleCFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleDFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleFFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleSEFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class Form8995FactsBuilder extends TaxPreviewFactBuilder
{
    public function __construct(
        K1CodeCharacterResolver $k1CodeCharacterResolver,
        private readonly Form8995AFactsBuilder $form8995AFactsBuilder,
    ) {
        parent::__construct($k1CodeCharacterResolver);
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     */
    public function build(
        array $k1Docs,
        ScheduleCFacts $scheduleC,
        ScheduleFFacts $scheduleF,
        ScheduleSEFacts $scheduleSE,
        ScheduleDFacts $scheduleD,
        float $taxableIncomeBeforeQbi,
        int $year,
        bool $isMarried,
    ): Form8995Facts {
        $entities = [
            ...$this->scheduleCEntities($scheduleC, $scheduleSE),
            ...$this->scheduleFEntities($scheduleF, $scheduleSE),
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
        $phaseInRanges = Form8995Facts::phaseInRanges($year);
        $threshold = $isMarried ? $thresholds['mfj'] : $thresholds['single'];
        $phaseInRange = $isMarried ? $phaseInRanges['mfj'] : $phaseInRanges['single'];
        $aboveThreshold = $taxableIncomeBeforeQbi > $threshold;
        $form8995A = $aboveThreshold ? $this->form8995AFactsBuilder->build(
            entities: $entities,
            qualifiedReitDividends: $qualifiedReitDividends,
            qualifiedPtpIncome: $qualifiedPtpIncome,
            taxableIncomeBeforeQbi: $taxableIncomeBeforeQbi,
            netCapitalGain: $netCapitalGain,
            taxableIncomeLessNetCapitalGain: $taxableIncomeLessNetCapitalGain,
            incomeLimitation: $taxableIncomeCap,
            threshold: $threshold,
            phaseInRange: $phaseInRange,
        ) : null;
        $deductionBeforeCap = $form8995A instanceof Form8995AFacts
            ? $form8995A->deductionBeforeIncomeLimit
            : $this->sumMoney([$totalQbiComponent, $reitPtpComponent]);
        $deduction = $form8995A instanceof Form8995AFacts
            ? $form8995A->deduction
            : min($deductionBeforeCap, $taxableIncomeCap);

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
            reviewSources: [],
            form8995A: $form8995A,
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

        $deductibleSeTax = $this->allocatedDeductibleSeTax($scheduleSE, [TaxFactSourceType::ScheduleSEScheduleC]);
        $qbiIncome = $this->subtractMoney($scheduleC->netProfit, $deductibleSeTax);

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
                        routingReason: 'Schedule C QBI starts with line 31 and is reduced by the Schedule C share of deductible half self-employment tax.',
                        notes: "Schedule C net {$scheduleC->netProfit}; allocated deductible half SE tax {$deductibleSeTax}.",
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
    private function scheduleFEntities(ScheduleFFacts $scheduleF, ScheduleSEFacts $scheduleSE): array
    {
        if ($scheduleF->netFarmProfit === 0.0) {
            return [];
        }

        $deductibleSeTax = $this->allocatedDeductibleSeTax($scheduleSE, [TaxFactSourceType::ScheduleSEScheduleF]);
        $qbiIncome = $this->subtractMoney($scheduleF->netFarmProfit, $deductibleSeTax);

        return [
            new Form8995EntityFact(
                entityKey: 'schedule-f',
                label: 'Schedule F farming activity',
                sourceKind: 'schedule_f',
                sources: [
                    new TaxFactSource(
                        id: 'schedule-f-form-8995-line1',
                        label: 'Schedule F net farm profit after half-SE-tax adjustment',
                        amount: $qbiIncome,
                        sourceType: TaxFactSourceType::Form8995ScheduleFQbi,
                        routing: TaxFactRouting::Form8995Line1,
                        routingReason: 'Schedule F QBI starts with line 34 and is reduced by the Schedule F share of deductible half self-employment tax.',
                        notes: "Schedule F net {$scheduleF->netFarmProfit}; allocated deductible half SE tax {$deductibleSeTax}.",
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
                ...($this->statementAHasAmount($statementA, 'qualifiedBusinessIncome') ? [] : $this->k1CodeSources($doc, $partnerName, $data, '20', 'Z', TaxFactSourceType::Form8995K1Box20Z, TaxFactRouting::Form8995Line1, 'partnership Section 199A QBI')),
                ...($this->statementAHasAmount($statementA, 'reitDividends') ? [] : $this->k1CodeSources($doc, $partnerName, $data, '20', 'AA', TaxFactSourceType::Form8995K1Box20Aa, TaxFactRouting::Form8995Line6, 'qualified REIT dividends')),
                ...($this->statementAHasAmount($statementA, 'ptpIncome') ? [] : $this->k1CodeSources($doc, $partnerName, $data, '20', 'AB', TaxFactSourceType::Form8995K1Box20Ab, TaxFactRouting::Form8995Line9, 'qualified PTP income')),
                ...($this->statementAHasAmount($statementA, 'reitDividends') ? [] : $this->k1CodeSources($doc, $partnerName, $data, '20', 'AC', TaxFactSourceType::Form8995K1Box20Ac, TaxFactRouting::Form8995Line6, 'qualified REIT dividends')),
                ...($this->statementAHasAmount($statementA, 'ptpIncome') ? [] : $this->k1CodeSources($doc, $partnerName, $data, '20', 'AD', TaxFactSourceType::Form8995K1Box20Ad, TaxFactRouting::Form8995Line9, 'qualified PTP income')),
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
                w2Wages: $this->statementAAmount($statementA, 'w2Wages'),
                ubia: $this->statementAAmount($statementA, 'ubia'),
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

    /**
     * @param  array<string, mixed>  $statementA
     */
    private function statementAHasAmount(array $statementA, string $field): bool
    {
        $amount = $this->parseMoney($statementA[$field] ?? null);

        return $amount !== null && $amount !== 0.0;
    }

    /**
     * @param  array<string, mixed>  $statementA
     */
    private function statementAAmount(array $statementA, string $field): float
    {
        return $this->parseMoney($statementA[$field] ?? null) ?? 0.0;
    }

    /**
     * Allocates the deductible half-SE-tax by positive source amount.
     *
     * This is an approximation when multiple activities exceed the Social Security wage base because the capped Social Security portion is not strictly proportional across sources.
     *
     * @param  TaxFactSourceType[]  $sourceTypes
     */
    private function allocatedDeductibleSeTax(ScheduleSEFacts $scheduleSE, array $sourceTypes): float
    {
        if ($scheduleSE->deductibleSeTax <= 0.0) {
            return 0.0;
        }

        $matchingCents = $this->positiveSourceCents($scheduleSE->entries, $sourceTypes);
        $totalCents = $this->positiveSourceCents($scheduleSE->entries);

        if ($matchingCents === 0 || $totalCents === 0) {
            return 0.0;
        }

        return MoneyMath::allocateRatio($scheduleSE->deductibleSeTax, $matchingCents, $totalCents)['allocated'];
    }

    /**
     * @param  TaxFactSource[]  $sources
     * @param  TaxFactSourceType[]|null  $sourceTypes
     */
    private function positiveSourceCents(array $sources, ?array $sourceTypes = null): int
    {
        $sourceTypeValues = $sourceTypes === null
            ? null
            : array_map(static fn (TaxFactSourceType $sourceType): string => $sourceType->value, $sourceTypes);

        $cents = 0;
        foreach ($sources as $source) {
            if ($source->amount <= 0.0) {
                continue;
            }

            if (is_array($sourceTypeValues) && ! in_array($source->sourceType, $sourceTypeValues, true)) {
                continue;
            }

            $cents += MoneyMath::toCents($source->amount);
        }

        return $cents;
    }
}
