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

    /**
     * @param  PartnershipBasisInterestFacts[]  $interests
     * @param  TaxFactSource[]  $distributionGainSources  Excess cash-distribution gains (gain
     *                                                    from the sale/exchange of the interest),
     *                                                    reviewable and fed to Schedule D line 12.
     * @param  TaxFactSource[]  $liquidationGainLossSources  Review-only liquidation gain/loss estimates.
     */
    public function __construct(
        public int $year,
        array $interests,
        array $distributionGainSources = [],
        array $liquidationGainLossSources = [],
    ) {
        $this->interests = $interests;
        $this->distributionGainSources = $distributionGainSources;
        $this->liquidationGainLossSources = $liquidationGainLossSources;
    }

    public static function empty(int $year): self
    {
        return new self($year, [], [], []);
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
        ];
    }
}
