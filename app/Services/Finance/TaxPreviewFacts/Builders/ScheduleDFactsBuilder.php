<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\CapitalGains\ScheduleDRollupInput;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleDFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleDRollupFact;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class ScheduleDFactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     * @param  ScheduleDRollupInput[]  $rollups
     */
    public function build(array $k1Docs, array $docs1099, array $rollups): ScheduleDFacts
    {
        $lineBuckets = $this->emptyScheduleDLineBuckets();
        foreach ($rollups as $rollup) {
            if (! isset($lineBuckets[$rollup->scheduleDLine])) {
                continue;
            }

            $lineBuckets[$rollup->scheduleDLine]['proceeds'] = $this->sumMoney([$lineBuckets[$rollup->scheduleDLine]['proceeds'], $rollup->totalProceeds]);
            $lineBuckets[$rollup->scheduleDLine]['cost'] = $this->sumMoney([$lineBuckets[$rollup->scheduleDLine]['cost'], $rollup->totalCostBasis]);
            $lineBuckets[$rollup->scheduleDLine]['adjustments'] = $this->sumMoney([$lineBuckets[$rollup->scheduleDLine]['adjustments'], $rollup->totalAdjustment]);
            $lineBuckets[$rollup->scheduleDLine]['gainLoss'] = $this->sumMoney([$lineBuckets[$rollup->scheduleDLine]['gainLoss'], $rollup->netGainOrLoss]);
        }

        $section1256Sources = $this->scheduleDSection1256Sources($k1Docs);
        $line3Sources = $section1256Sources['shortTerm'];
        $line10Sources = $section1256Sources['longTerm'];
        $line5Sources = $this->scheduleDLine5Sources($k1Docs);
        $line12Sources = $this->scheduleDLine12Sources($k1Docs);
        $line13Sources = $this->scheduleDLine13Sources($docs1099);
        $ambiguous11SSources = $this->scheduleDAmbiguous11SSources($k1Docs);

        $line1a = $this->roundMoney($this->scheduleDLineGainLoss($lineBuckets, '1a'));
        $line1b = $this->roundMoney($this->scheduleDLineGainLoss($lineBuckets, '1b'));
        $line2 = $this->roundMoney($this->scheduleDLineGainLoss($lineBuckets, '2'));
        $line3 = $this->sumMoney([$this->scheduleDLineGainLoss($lineBuckets, '3'), $this->sumSources($line3Sources)]);
        $line4 = 0.0;
        $line5 = $this->sumSources($line5Sources);
        $line6 = 0.0;
        $line7 = $this->sumMoney([$line1a, $line1b, $line2, $line3, $line4, $line5, $line6]);

        $line8a = $this->roundMoney($this->scheduleDLineGainLoss($lineBuckets, '8a'));
        $line8b = $this->roundMoney($this->scheduleDLineGainLoss($lineBuckets, '8b'));
        $line9 = $this->roundMoney($this->scheduleDLineGainLoss($lineBuckets, '9'));
        $line10 = $this->sumMoney([$this->scheduleDLineGainLoss($lineBuckets, '10'), $this->sumSources($line10Sources)]);
        $line11 = 0.0;
        $line12 = $this->sumSources($line12Sources);
        $line13 = $this->sumSources($line13Sources);
        $line14 = 0.0;
        $line15 = $this->sumMoney([$line8a, $line8b, $line9, $line10, $line11, $line12, $line13, $line14]);
        $line16 = $this->sumMoney([$line7, $line15]);
        $line21 = $line16 < 0.0 ? max($line16, -3000.0) : $line16;
        $appliedToReturn = $line21 < 0.0 ? $line21 : 0.0;
        $carryforward = $line16 < 0.0 ? $this->subtractMoney($line16, $appliedToReturn) : 0.0;
        $businessCapGains = $this->sumMoney([$line5, $line12]);
        $personalCapGains = $this->subtractMoney($line16, $businessCapGains);
        $limited = $this->limitedCapitalGains($line16, $line21, $businessCapGains, $personalCapGains);

        return new ScheduleDFacts(
            form8949Rollups: array_map(static fn (ScheduleDRollupInput $rollup): ScheduleDRollupFact => ScheduleDRollupFact::fromRollup($rollup), $rollups),
            line1aGainLoss: $line1a,
            line1bGainLoss: $line1b,
            line2GainLoss: $line2,
            line3Sources: $line3Sources,
            line3GainLoss: $line3,
            line4GainLoss: $line4,
            line5Sources: $line5Sources,
            line5GainLoss: $line5,
            line6Carryover: $line6,
            line7NetShortTerm: $line7,
            line8aGainLoss: $line8a,
            line8bGainLoss: $line8b,
            line9GainLoss: $line9,
            line10Sources: $line10Sources,
            line10GainLoss: $line10,
            line11GainLoss: $line11,
            line12Sources: $line12Sources,
            line12GainLoss: $line12,
            line13Sources: $line13Sources,
            line13CapitalGainDistributions: $line13,
            line14Carryover: $line14,
            line15NetLongTerm: $line15,
            line16Combined: $line16,
            line21LimitedLossOrGain: $line21,
            appliedToReturn: $appliedToReturn,
            carryforward: $carryforward,
            totalBusinessCapGains: $businessCapGains,
            totalPersonalCapGains: $personalCapGains,
            limitedBusinessCapGains: $limited['business'],
            limitedPersonalCapGains: $limited['personal'],
            ambiguous11SSources: $ambiguous11SSources,
            ambiguous11SAmount: $this->sumSources($ambiguous11SSources),
        );
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @return array{shortTerm:TaxFactSource[],longTerm:TaxFactSource[]}
     */
    private function scheduleDSection1256Sources(array $k1Docs): array
    {
        $shortTerm = [];
        $longTerm = [];

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            foreach ($this->k1CodeItems($data, '11', 'C') as $index => $item) {
                $amount = $this->parseMoney($item['value'] ?? null) ?? 0.0;
                if ($amount === 0.0) {
                    continue;
                }

                $allocation = MoneyMath::allocateRatio($amount, 40, 100);
                $shortTermAmount = $allocation['allocated'];
                $longTermAmount = $allocation['remainder'];
                $shortTerm[] = new TaxFactSource(
                    id: "k1-{$doc->id}-11C-{$index}-schedule-d-line3",
                    label: "{$partnerName} — K-1 Box 11C Form 6781 40% S/T allocation",
                    amount: $shortTermAmount,
                    sourceType: TaxFactSourceType::K1Section1256ShortTerm,
                    taxDocumentId: $doc->id,
                    formType: 'k1',
                    box: '11',
                    code: 'C',
                    routing: TaxFactRouting::ScheduleDLine3,
                    routingReason: 'Section 1256 contracts are split 40% short-term and 60% long-term through Form 6781.',
                    notes: is_string($item['notes'] ?? null) ? $item['notes'] : null,
                    isReviewed: $this->sourceIsReviewed($doc),
                    reviewStatus: $this->reviewStatus($doc),
                    reviewAction: $this->reviewAction($doc),
                );
                $longTerm[] = new TaxFactSource(
                    id: "k1-{$doc->id}-11C-{$index}-schedule-d-line10",
                    label: "{$partnerName} — K-1 Box 11C Form 6781 60% L/T allocation",
                    amount: $longTermAmount,
                    sourceType: TaxFactSourceType::K1Section1256LongTerm,
                    taxDocumentId: $doc->id,
                    formType: 'k1',
                    box: '11',
                    code: 'C',
                    routing: TaxFactRouting::ScheduleDLine10,
                    routingReason: 'Section 1256 contracts are split 40% short-term and 60% long-term through Form 6781.',
                    notes: is_string($item['notes'] ?? null) ? $item['notes'] : null,
                    isReviewed: $this->sourceIsReviewed($doc),
                    reviewStatus: $this->reviewStatus($doc),
                    reviewAction: $this->reviewAction($doc),
                );
            }
        }

        return ['shortTerm' => $shortTerm, 'longTerm' => $longTerm];
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @return TaxFactSource[]
     */
    private function scheduleDLine5Sources(array $k1Docs): array
    {
        $sources = [];

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            $box8 = $this->k1Field($data, '8');
            if ($box8 !== 0.0) {
                $sources[] = $this->k1ScheduleDSource($doc, $partnerName, $box8, TaxFactSourceType::K1ShortTermCapitalGain, '8', null, TaxFactRouting::ScheduleDLine5, 'K-1 Box 8 short-term capital gain/loss flows to Schedule D line 5.');
            }

            foreach ($this->k1CodeItems($data, '11', 'S') as $index => $item) {
                if (($this->k1CodeCharacterResolver->resolve('11', $item)['character'] ?? null) !== 'short') {
                    continue;
                }

                $amount = $this->parseMoney($item['value'] ?? null) ?? 0.0;
                if ($amount === 0.0) {
                    continue;
                }

                $sources[] = $this->k1ScheduleDSource($doc, $partnerName, $amount, TaxFactSourceType::K1NonportfolioShortTermCapitalGain, '11', 'S', TaxFactRouting::ScheduleDLine5, 'K-1 Box 11S short-term non-portfolio capital gain/loss flows to Schedule D line 5.', $index, is_string($item['notes'] ?? null) ? $item['notes'] : null);
            }
        }

        return $sources;
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @return TaxFactSource[]
     */
    private function scheduleDLine12Sources(array $k1Docs): array
    {
        $sources = [];

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            foreach ([
                '9a' => [TaxFactSourceType::K1LongTermCapitalGain, 'K-1 Box 9a long-term capital gain/loss flows to Schedule D line 12.'],
                '9b' => [TaxFactSourceType::K1CollectiblesGain, 'K-1 Box 9b collectibles gain/loss supports Schedule D line 12.'],
                '9c' => [TaxFactSourceType::K1Unrecaptured1250Gain, 'K-1 Box 9c unrecaptured Section 1250 gain supports Schedule D line 12.'],
                '10' => [TaxFactSourceType::K1Section1231Gain, 'K-1 Box 10 net Section 1231 gain/loss flows to Schedule D line 12.'],
            ] as $box => [$sourceType, $reason]) {
                $amount = $this->k1Field($data, $box);
                if ($amount !== 0.0) {
                    $sources[] = $this->k1ScheduleDSource($doc, $partnerName, $amount, $sourceType, $box, null, TaxFactRouting::ScheduleDLine12, $reason);
                }
            }

            foreach ($this->k1CodeItems($data, '11', 'S') as $index => $item) {
                if (($this->k1CodeCharacterResolver->resolve('11', $item)['character'] ?? null) !== 'long') {
                    continue;
                }

                $amount = $this->parseMoney($item['value'] ?? null) ?? 0.0;
                if ($amount === 0.0) {
                    continue;
                }

                $sources[] = $this->k1ScheduleDSource($doc, $partnerName, $amount, TaxFactSourceType::K1NonportfolioLongTermCapitalGain, '11', 'S', TaxFactRouting::ScheduleDLine12, 'K-1 Box 11S long-term non-portfolio capital gain/loss flows to Schedule D line 12.', $index, is_string($item['notes'] ?? null) ? $item['notes'] : null);
            }
        }

        return $sources;
    }

    /**
     * @param  FileForTaxDocument[]  $docs1099
     * @return TaxFactSource[]
     */
    private function scheduleDLine13Sources(array $docs1099): array
    {
        $sources = [];

        foreach ($docs1099 as $doc) {
            foreach ($this->document1099DivEntries($doc) as $entry) {
                $amount = $this->firstNumericOrNestedValue(
                    $entry['parsedData'],
                    ['box2a_cap_gain', 'div_2a_cap_gain'],
                    ['2a_total_capital_gain_distributions'],
                );
                if ($amount === null || $amount === 0.0) {
                    continue;
                }

                $sources[] = new TaxFactSource(
                    id: $entry['link'] instanceof TaxDocumentAccount ? "link-{$entry['link']->id}-schedule-d-line13" : "doc-{$doc->id}-schedule-d-line13",
                    label: "{$this->payerName($doc, $entry['link'], $entry['parsedData'])} — capital gain distributions",
                    amount: $this->roundMoney($amount),
                    sourceType: TaxFactSourceType::Form1099DivCapitalGainDistributions,
                    taxDocumentId: $doc->id,
                    taxDocumentAccountId: $entry['link']?->id,
                    accountId: $entry['link']?->account_id,
                    formType: '1099_div',
                    box: '2a',
                    routing: TaxFactRouting::ScheduleDLine13,
                    routingReason: '1099-DIV Box 2a total capital gain distributions flow to Schedule D line 13.',
                    isReviewed: $this->sourceIsReviewed($doc, $entry['link']),
                    reviewStatus: $this->reviewStatus($doc, $entry['link']),
                    reviewAction: $this->reviewAction($doc, $entry['link']),
                );
            }
        }

        return $sources;
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @return TaxFactSource[]
     */
    private function scheduleDAmbiguous11SSources(array $k1Docs): array
    {
        $sources = [];

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            foreach ($this->k1CodeItems($data, '11', 'S') as $index => $item) {
                $amount = $this->parseMoney($item['value'] ?? null) ?? 0.0;
                if ($amount === 0.0 || $this->k1CodeCharacterResolver->resolve('11', $item) !== null) {
                    continue;
                }

                $sources[] = $this->k1ScheduleDSource($doc, $partnerName, $amount, TaxFactSourceType::K1AmbiguousNonportfolioCapitalGain, '11', 'S', TaxFactRouting::NeedsReviewScheduleDLine5Or12, 'K-1 Box 11S needs short-term or long-term character before Schedule D routing.', $index, is_string($item['notes'] ?? null) ? $item['notes'] : null);
            }
        }

        return $sources;
    }

    private function k1ScheduleDSource(
        FileForTaxDocument $doc,
        string $partnerName,
        float $amount,
        TaxFactSourceType $sourceType,
        string $box,
        ?string $code,
        TaxFactRouting $routing,
        string $routingReason,
        ?int $index = null,
        ?string $notes = null,
    ): TaxFactSource {
        $suffix = $index !== null ? "-{$index}" : '';

        return new TaxFactSource(
            id: "k1-{$doc->id}-{$box}{$code}{$suffix}-{$routing->value}",
            label: $code !== null ? "{$partnerName} — K-1 Box {$box}{$code}" : "{$partnerName} — K-1 Box {$box}",
            amount: $this->roundMoney($amount),
            sourceType: $sourceType,
            taxDocumentId: $doc->id,
            formType: 'k1',
            box: $box,
            code: $code,
            routing: $routing,
            routingReason: $routingReason,
            notes: $notes,
            isReviewed: $this->sourceIsReviewed($doc),
            reviewStatus: $this->reviewStatus($doc),
            reviewAction: $this->reviewAction($doc),
        );
    }

    /**
     * @return array<string, array{proceeds:float,cost:float,adjustments:float,gainLoss:float}>
     */
    private function emptyScheduleDLineBuckets(): array
    {
        $buckets = [];
        foreach (['1a', '1b', '2', '3', '8a', '8b', '9', '10'] as $line) {
            $buckets[$line] = ['proceeds' => 0.0, 'cost' => 0.0, 'adjustments' => 0.0, 'gainLoss' => 0.0];
        }

        return $buckets;
    }

    /**
     * @param  array<string, array{proceeds:float,cost:float,adjustments:float,gainLoss:float}>  $lineBuckets
     */
    private function scheduleDLineGainLoss(array $lineBuckets, string $line): float
    {
        return $lineBuckets[$line]['gainLoss'] ?? 0.0;
    }

    /**
     * @return array{business:float,personal:float}
     */
    private function limitedCapitalGains(float $line16, float $line21, float $businessCapGains, float $personalCapGains): array
    {
        if ($line21 === $line16) {
            return ['business' => $businessCapGains, 'personal' => $personalCapGains];
        }

        if ($line16 >= 0.0) {
            return ['business' => $businessCapGains, 'personal' => $personalCapGains];
        }

        if ($this->hasMixedSigns($businessCapGains, $personalCapGains)) {
            return $this->limitedMixedSignCapitalGains($line21, $businessCapGains, $personalCapGains);
        }

        $businessRatio = $line16 === 0.0 ? 0.0 : $businessCapGains / $line16;
        $personalRatio = $line16 === 0.0 ? 0.0 : $personalCapGains / $line16;

        return [
            'business' => $this->roundMoney($line21 * $businessRatio),
            'personal' => $this->roundMoney($line21 * $personalRatio),
        ];
    }

    private function hasMixedSigns(float $businessCapGains, float $personalCapGains): bool
    {
        return ($businessCapGains < 0.0 && $personalCapGains > 0.0)
            || ($businessCapGains > 0.0 && $personalCapGains < 0.0);
    }

    /**
     * @return array{business:float,personal:float}
     */
    private function limitedMixedSignCapitalGains(float $line21, float $businessCapGains, float $personalCapGains): array
    {
        if ($line21 >= 0.0) {
            return ['business' => $businessCapGains, 'personal' => $personalCapGains];
        }

        $business = min(0.0, $businessCapGains);
        $personal = min(0.0, $personalCapGains);
        $negativeTotal = $this->sumMoney([$business, $personal]);

        if ($negativeTotal >= $line21) {
            return ['business' => $business, 'personal' => $personal];
        }

        if ($business < 0.0) {
            return ['business' => $line21, 'personal' => 0.0];
        }

        return ['business' => 0.0, 'personal' => $line21];
    }
}
