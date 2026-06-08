<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class PartnershipBasisFacts
{
    /** @var PartnershipBasisInterestFacts[] */
    public array $interests;

    /** @param PartnershipBasisInterestFacts[] $interests */
    public function __construct(public int $year, array $interests)
    {
        $this->interests = $interests;
    }

    public static function empty(int $year): self
    {
        return new self($year, []);
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'year' => $this->year,
            'interestCount' => count($this->interests),
            'interests' => array_map(static fn (PartnershipBasisInterestFacts $interest): array => $interest->toArray(), $this->interests),
        ];
    }
}
