<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Services\Finance\TaxPreviewFacts\Data\Form8959Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleSEFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use LogicException;

class Form8959FactsBuilder extends TaxPreviewFactBuilder
{
    private const float ADDITIONAL_MEDICARE_RATE = 0.009;

    private const float REGULAR_MEDICARE_RATE = 0.0145;

    private const float SINGLE_THRESHOLD = 200000.0;

    private const float MARRIED_FILING_JOINTLY_THRESHOLD = 250000.0;

    private const array MEDICARE_WAGE_SOURCE_TYPES = [
        TaxFactSourceType::ScheduleSEW2MedicareWages->value,
        TaxFactSourceType::ScheduleSEPayslipMedicareWages->value,
    ];

    public function build(ScheduleSEFacts $scheduleSE, bool $isMarried): Form8959Facts
    {
        $threshold = $isMarried ? self::MARRIED_FILING_JOINTLY_THRESHOLD : self::SINGLE_THRESHOLD;
        $wages = $scheduleSE->medicareWages;
        $excessWages = max(0.0, $this->subtractMoney($wages, $threshold));
        $medicareTaxWithheld = $scheduleSE->medicareTaxWithheld;
        $regularMedicareTaxWithholding = $this->roundMoney($wages * self::REGULAR_MEDICARE_RATE);
        $additionalMedicareWithholding = max(0.0, $this->subtractMoney($medicareTaxWithheld, $regularMedicareTaxWithholding));

        return new Form8959Facts(
            wages: $wages,
            threshold: $threshold,
            excessWages: $excessWages,
            additionalTax: $this->roundMoney($excessWages * self::ADDITIONAL_MEDICARE_RATE),
            medicareTaxWithheld: $medicareTaxWithheld,
            regularMedicareTaxWithholding: $regularMedicareTaxWithholding,
            additionalMedicareWithholding: $additionalMedicareWithholding,
            wageSources: $this->wageSources($scheduleSE),
            withholdingSources: $this->withholdingSources($scheduleSE),
        );
    }

    /**
     * @return TaxFactSource[]
     */
    private function wageSources(ScheduleSEFacts $scheduleSE): array
    {
        return array_values(array_map(
            fn (TaxFactSource $source): TaxFactSource => $this->cloneForForm8959($source),
            array_filter(
                $scheduleSE->wageSources,
                static fn (TaxFactSource $source): bool => in_array($source->sourceType, self::MEDICARE_WAGE_SOURCE_TYPES, true),
            ),
        ));
    }

    /**
     * @return TaxFactSource[]
     */
    private function withholdingSources(ScheduleSEFacts $scheduleSE): array
    {
        return array_values(array_map(
            fn (TaxFactSource $source): TaxFactSource => $this->cloneForForm8959Line19($source),
            $scheduleSE->medicareTaxWithheldSources,
        ));
    }

    private function cloneForForm8959(TaxFactSource $source): TaxFactSource
    {
        $sourceType = TaxFactSourceType::tryFrom($source->sourceType);
        if (! $sourceType instanceof TaxFactSourceType) {
            throw new LogicException("Cannot clone tax fact source {$source->id} for Form 8959 because source type {$source->sourceType} is not recognized.");
        }

        return new TaxFactSource(
            id: "{$source->id}-form8959-line1",
            label: $source->label,
            amount: $source->amount,
            sourceType: $sourceType,
            taxDocumentId: $source->taxDocumentId,
            taxDocumentAccountId: $source->taxDocumentAccountId,
            accountId: $source->accountId,
            formType: $source->formType,
            box: $source->box,
            code: $source->code,
            routing: TaxFactRouting::Form8959Line1,
            routingReason: 'Medicare wages flow to Form 8959 line 1 for wage-side Additional Medicare Tax.',
            notes: $source->notes,
            isReviewed: $source->isReviewed,
            reviewStatus: $source->reviewStatus,
            reviewAction: $source->reviewAction,
        );
    }

    private function cloneForForm8959Line19(TaxFactSource $source): TaxFactSource
    {
        $sourceType = TaxFactSourceType::tryFrom($source->sourceType);
        if (! $sourceType instanceof TaxFactSourceType) {
            throw new LogicException("Cannot clone tax fact source {$source->id} for Form 8959 because source type {$source->sourceType} is not recognized.");
        }

        return new TaxFactSource(
            id: "{$source->id}-form8959-line19",
            label: $source->label,
            amount: $source->amount,
            sourceType: $sourceType,
            taxDocumentId: $source->taxDocumentId,
            taxDocumentAccountId: $source->taxDocumentAccountId,
            accountId: $source->accountId,
            formType: $source->formType,
            box: $source->box,
            code: $source->code,
            routing: TaxFactRouting::Form8959Line19,
            routingReason: 'Medicare tax withheld from W-2 box 6 supports Form 8959 line 19.',
            notes: $source->notes,
            isReviewed: $source->isReviewed,
            reviewStatus: $source->reviewStatus,
            reviewAction: $source->reviewAction,
        );
    }
}
