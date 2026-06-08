<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class PartnershipBasisFacts
{
    /** @var PartnershipBasisInterestFacts[] */
    public array $interests;

    /** @var TaxFactSource[] */
    public array $distributionGainSources;

    /** @var TaxFactSource[] */
    public array $liquidationGainLossSources;

    /** @var Form8949RowFact[] */
    public array $form8949Rows;

    /** @var PartnershipBasisReconciliationFacts[] */
    public array $reconciliations;

    /**
     * @param  PartnershipBasisInterestFacts[]  $interests
     * @param  TaxFactSource[]  $distributionGainSources  Excess cash-distribution gains (gain
     *                                                    from the sale/exchange of the interest),
     *                                                    reviewable and routed to Schedule D line 3
     *                                                    (short-term) or line 10 (long-term).
     * @param  TaxFactSource[]  $liquidationGainLossSources  Review-only liquidation gain/loss estimates.
     * @param  Form8949RowFact[]  $form8949Rows  Form 8949 disposition rows for §731 gains with a
     *                                           determinable holding period.
     * @param  PartnershipBasisReconciliationFacts[]  $reconciliations  Read-only transaction/statement
     *                                                                  reconciliation per account.
     */
    public function __construct(
        public int $year,
        array $interests,
        array $distributionGainSources = [],
        array $liquidationGainLossSources = [],
        array $form8949Rows = [],
        array $reconciliations = [],
    ) {
        $this->interests = $interests;
        $this->distributionGainSources = $distributionGainSources;
        $this->liquidationGainLossSources = $liquidationGainLossSources;
        $this->form8949Rows = $form8949Rows;
        $this->reconciliations = $reconciliations;
    }

    public static function empty(int $year): self
    {
        return new self($year, [], [], [], [], []);
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'year' => $this->year,
            'interestCount' => count($this->interests),
            'interests' => array_map(static fn (PartnershipBasisInterestFacts $interest): array => $interest->toArray(), $this->interests),
            'distributionGainSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->distributionGainSources),
            'liquidationGainLossSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->liquidationGainLossSources),
            'form8949Rows' => array_map(static fn (Form8949RowFact $row): array => $row->toArray(), $this->form8949Rows),
            'reconciliations' => array_map(static fn (PartnershipBasisReconciliationFacts $reconciliation): array => $reconciliation->toArray(), $this->reconciliations),
        ];
    }
}
