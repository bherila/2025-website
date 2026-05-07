<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8995EntityFact
{
    /**
     * @var TaxFactSource[]
     */
    public array $sources;

    /**
     * @param  TaxFactSource[]  $sources
     */
    public function __construct(
        public string $entityKey,
        public string $label,
        public string $sourceKind,
        array $sources,
        public float $qbiIncome,
        public float $reitDividends,
        public float $ptpIncome,
        public float $qbiComponent,
        public float $w2Wages = 0.0,
        public float $ubia = 0.0,
        public bool $isSstb = false,
        public ?string $sectionNotes = null,
        public bool $needsForm8995AReview = false,
        public ?string $form8995AReviewReason = null,
    ) {
        $this->sources = $sources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'entityKey' => $this->entityKey,
            'label' => $this->label,
            'sourceKind' => $this->sourceKind,
            'sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->sources),
            'qbiIncome' => $this->qbiIncome,
            'reitDividends' => $this->reitDividends,
            'ptpIncome' => $this->ptpIncome,
            'qbiComponent' => $this->qbiComponent,
            'w2Wages' => $this->w2Wages,
            'ubia' => $this->ubia,
            'isSstb' => $this->isSstb,
            'sectionNotes' => $this->sectionNotes,
            'needsForm8995AReview' => $this->needsForm8995AReview,
            'form8995AReviewReason' => $this->form8995AReviewReason,
        ];
    }
}
