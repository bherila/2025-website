<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\TaxPreviewFacts\Data\Form6781Facts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class Form6781FactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  FileForTaxDocument[]  $k1Docs
     */
    public function build(array $k1Docs): Form6781Facts
    {
        $shortTermSources = [];
        $longTermSources = [];

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
                $shortTermSources[] = new TaxFactSource(
                    id: "k1-{$doc->id}-11C-{$index}-schedule-d-line4",
                    label: "{$partnerName} — K-1 Box 11C Form 6781 40% S/T allocation",
                    amount: $shortTermAmount,
                    sourceType: TaxFactSourceType::K1Section1256ShortTerm,
                    taxDocumentId: $doc->id,
                    formType: 'k1',
                    box: '11',
                    code: 'C',
                    routing: TaxFactRouting::ScheduleDLine4,
                    routingReason: 'Section 1256 contracts are split 40% short-term and 60% long-term through Form 6781; the short-term portion flows to Schedule D line 4.',
                    notes: is_string($item['notes'] ?? null) ? $item['notes'] : null,
                    isReviewed: $this->sourceIsReviewed($doc),
                    reviewStatus: $this->reviewStatus($doc),
                    reviewAction: $this->reviewAction($doc),
                );
                $longTermSources[] = new TaxFactSource(
                    id: "k1-{$doc->id}-11C-{$index}-schedule-d-line11",
                    label: "{$partnerName} — K-1 Box 11C Form 6781 60% L/T allocation",
                    amount: $longTermAmount,
                    sourceType: TaxFactSourceType::K1Section1256LongTerm,
                    taxDocumentId: $doc->id,
                    formType: 'k1',
                    box: '11',
                    code: 'C',
                    routing: TaxFactRouting::ScheduleDLine11,
                    routingReason: 'Section 1256 contracts are split 40% short-term and 60% long-term through Form 6781; the long-term portion flows to Schedule D line 11.',
                    notes: is_string($item['notes'] ?? null) ? $item['notes'] : null,
                    isReviewed: $this->sourceIsReviewed($doc),
                    reviewStatus: $this->reviewStatus($doc),
                    reviewAction: $this->reviewAction($doc),
                );
            }
        }

        $shortTermTotal = $this->sumSources($shortTermSources);
        $longTermTotal = $this->sumSources($longTermSources);

        return new Form6781Facts(
            shortTermSources: $shortTermSources,
            longTermSources: $longTermSources,
            shortTermTotal: $shortTermTotal,
            longTermTotal: $longTermTotal,
            netGain: $this->sumMoney([$shortTermTotal, $longTermTotal]),
        );
    }
}
