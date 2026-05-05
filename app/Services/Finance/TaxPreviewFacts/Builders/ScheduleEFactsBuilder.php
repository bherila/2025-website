<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleEFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class ScheduleEFactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     */
    public function build(array $k1Docs, array $docs1099): ScheduleEFacts
    {
        $miscIncomeSources = $this->miscIncomeSources($docs1099);
        $box1Sources = [];
        $box2Sources = [];
        $box3Sources = [];
        $box4Sources = [];
        $box11ZZSources = [];
        $box13ZZSources = [];
        $traderNiiSources = [];
        $totalBox5 = 0.0;

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            $box1Sources = [
                ...$box1Sources,
                ...$this->k1FieldSource($doc, $partnerName, $data, '1', TaxFactSourceType::K1ScheduleEBox1Ordinary, 'ordinary business income/loss'),
            ];
            $box2Sources = [
                ...$box2Sources,
                ...$this->k1FieldSource($doc, $partnerName, $data, '2', TaxFactSourceType::K1ScheduleEBox2Rental, 'net rental real estate income/loss'),
            ];
            $box3Sources = [
                ...$box3Sources,
                ...$this->k1FieldSource($doc, $partnerName, $data, '3', TaxFactSourceType::K1ScheduleEBox3Rental, 'other net rental income/loss'),
            ];
            $box4Sources = [
                ...$box4Sources,
                ...$this->k1FieldSource($doc, $partnerName, $data, '4', TaxFactSourceType::K1ScheduleEBox4GuaranteedPayments, 'guaranteed payments'),
            ];

            $totalBox5 = $this->sumMoney([$totalBox5, $this->k1Field($data, '5')]);
            $box11ZZSources = [
                ...$box11ZZSources,
                ...$this->k1CodeSources($doc, $partnerName, $data, '11', 'ZZ', TaxFactSourceType::K1ScheduleEBox11ZZOtherIncome, false),
            ];
            $box13ZZSources = [
                ...$box13ZZSources,
                ...$this->k1CodeSources($doc, $partnerName, $data, '13', 'ZZ', TaxFactSourceType::K1ScheduleEBox13ZZOtherDeductions, true),
            ];

            if ($this->isTraderFundK1($data)) {
                $traderNiiSources = [
                    ...$traderNiiSources,
                    ...$this->k1CodeSources($doc, $partnerName, $data, '11', 'ZZ', TaxFactSourceType::K1ScheduleEBox11ZZOtherIncome, false),
                    ...$this->k1CodeSources($doc, $partnerName, $data, '13', 'ZZ', TaxFactSourceType::K1ScheduleEBox13ZZOtherDeductions, true),
                ];
            }
        }

        $totalBox1 = $this->sumSources($box1Sources);
        $totalBox2 = $this->sumSources($box2Sources);
        $totalBox3 = $this->sumSources($box3Sources);
        $totalBox4 = $this->sumSources($box4Sources);
        $totalBox11ZZ = $this->sumSources($box11ZZSources);
        $totalBox13ZZ = $this->sumAbsoluteSources($box13ZZSources);
        $totalPassive = $this->sumMoney([$totalBox2, $totalBox3]);
        $totalNonpassive = $this->sumMoney([$totalBox1, $totalBox4, $totalBox11ZZ, -$totalBox13ZZ]);
        $miscIncomeTotal = $this->sumSources($miscIncomeSources);

        return new ScheduleEFacts(
            miscIncomeSources: $miscIncomeSources,
            miscIncomeTotal: $miscIncomeTotal,
            box1Sources: $box1Sources,
            totalBox1: $totalBox1,
            box2Sources: $box2Sources,
            totalBox2: $totalBox2,
            box3Sources: $box3Sources,
            totalBox3: $totalBox3,
            box4Sources: $box4Sources,
            totalBox4: $totalBox4,
            totalBox5: $this->roundMoney($totalBox5),
            box11ZZSources: $box11ZZSources,
            totalBox11ZZ: $totalBox11ZZ,
            box13ZZSources: $box13ZZSources,
            totalBox13ZZ: $totalBox13ZZ,
            traderNiiSources: $traderNiiSources,
            totalTraderNii: $this->sumSources($traderNiiSources),
            totalPassive: $totalPassive,
            totalNonpassive: $totalNonpassive,
            grandTotal: $this->sumMoney([$miscIncomeTotal, $totalPassive, $totalNonpassive]),
        );
    }

    /**
     * @param  FileForTaxDocument[]  $docs1099
     * @return TaxFactSource[]
     */
    private function miscIncomeSources(array $docs1099): array
    {
        $sources = [];

        foreach ($docs1099 as $doc) {
            $links = $doc->accountLinks;
            if ($links->isNotEmpty()) {
                foreach ($links as $link) {
                    if (! $link instanceof TaxDocumentAccount || $link->form_type !== '1099_misc') {
                        continue;
                    }

                    $routing = $link->misc_routing ?? $doc->misc_routing;
                    if ($routing !== 'sch_e') {
                        continue;
                    }

                    $parsedData = $this->parsedDataForLink($doc, $link);
                    if ($parsedData === null) {
                        continue;
                    }

                    $amount = $this->sumMiscValues($parsedData);
                    if ($amount === null || $amount === 0.0) {
                        continue;
                    }

                    $sources[] = $this->miscIncomeSource($doc, $link, $parsedData, $amount);
                }

                continue;
            }

            if ($this->formType($doc) !== '1099_misc' || $doc->misc_routing !== 'sch_e' || ! is_array($doc->parsed_data)) {
                continue;
            }

            $amount = $this->sumMiscValues($doc->parsed_data);
            if ($amount === null || $amount === 0.0) {
                continue;
            }

            $sources[] = $this->miscIncomeSource($doc, null, $doc->parsed_data, $amount);
        }

        return $sources;
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function miscIncomeSource(FileForTaxDocument $doc, ?TaxDocumentAccount $link, array $parsedData, float $amount): TaxFactSource
    {
        $payer = $this->payerName($doc, $link, $parsedData);

        return new TaxFactSource(
            id: $link instanceof TaxDocumentAccount ? "link-{$link->id}-schedule-e-misc" : "doc-{$doc->id}-schedule-e-misc",
            label: "{$payer} — 1099-MISC Schedule E income",
            amount: $this->roundMoney($amount),
            sourceType: TaxFactSourceType::Form1099MiscOtherIncome,
            taxDocumentId: $doc->id,
            taxDocumentAccountId: $link?->id,
            accountId: $link?->account_id,
            formType: '1099_misc',
            routing: TaxFactRouting::ScheduleELine3,
            routingReason: '1099-MISC explicitly routed to Schedule E is included in Schedule E Part I.',
            isReviewed: $this->sourceIsReviewed($doc, $link),
            reviewStatus: $this->reviewStatus($doc, $link),
            reviewAction: $this->reviewAction($doc, $link),
        );
    }

    /**
     * @param  array<string, mixed>  $data
     * @return TaxFactSource[]
     */
    private function k1FieldSource(FileForTaxDocument $doc, string $partnerName, array $data, string $box, TaxFactSourceType $sourceType, string $label): array
    {
        $amount = $this->k1Field($data, $box);
        if ($amount === 0.0) {
            return [];
        }

        return [
            new TaxFactSource(
                id: "k1-{$doc->id}-schedule-e-box-{$box}",
                label: "{$partnerName} — K-1 Box {$box} {$label}",
                amount: $this->roundMoney($amount),
                sourceType: $sourceType,
                taxDocumentId: $doc->id,
                formType: $this->formType($doc),
                box: $box,
                routing: TaxFactRouting::ScheduleELine28,
                routingReason: 'K-1 business and rental amounts are listed in Schedule E Part II.',
                isReviewed: $this->sourceIsReviewed($doc),
                reviewStatus: $this->reviewStatus($doc),
                reviewAction: $this->reviewAction($doc),
            ),
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return TaxFactSource[]
     */
    private function k1CodeSources(FileForTaxDocument $doc, string $partnerName, array $data, string $box, string $code, TaxFactSourceType $sourceType, bool $isDeduction): array
    {
        $sources = [];

        foreach ($this->k1CodeItems($data, $box, $code) as $index => $item) {
            $amount = $this->parseMoney($item['value'] ?? null);
            if ($amount === null || $amount === 0.0) {
                continue;
            }

            $signedAmount = $isDeduction ? -abs($amount) : $amount;
            $sources[] = new TaxFactSource(
                id: "k1-{$doc->id}-schedule-e-box-{$box}{$code}-{$index}",
                label: "{$partnerName} — K-1 Box {$box}{$code}",
                amount: $this->roundMoney($signedAmount),
                sourceType: $sourceType,
                taxDocumentId: $doc->id,
                formType: $this->formType($doc),
                box: $box,
                code: $code,
                routing: TaxFactRouting::ScheduleELine28,
                routingReason: 'K-1 supplemental ordinary income and deductions are included in Schedule E Part II.',
                notes: is_string($item['notes'] ?? null) ? $item['notes'] : null,
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
    private function isTraderFundK1(array $data): bool
    {
        $structuredTraderStatus = $data['fields']['partnershipPosition_traderInSecurities']['value'] ?? null;
        if ($structuredTraderStatus === 'true') {
            return true;
        }

        if ($structuredTraderStatus === 'false') {
            return false;
        }

        $warnings = is_array($data['warnings'] ?? null) ? $data['warnings'] : [];
        $notes = [];
        foreach ($data['codes'] ?? [] as $items) {
            if (! is_array($items)) {
                continue;
            }

            foreach ($items as $item) {
                if (is_array($item) && is_string($item['notes'] ?? null)) {
                    $notes[] = $item['notes'];
                }
            }
        }

        $haystack = strtolower(implode(' ', array_filter([
            is_string($data['raw_text'] ?? null) ? $data['raw_text'] : null,
            ...array_filter($warnings, 'is_string'),
            ...$notes,
        ])));

        // Some K-1 packages deny entity-level trader status while still reporting
        // trader-style deductions that belong in the Form 8960 NII audit trail.
        if (preg_match('/\b(?:not|isn\'t|is not|was not|no)\s+(?:a\s+)?trader in securities\b/i', $haystack)) {
            foreach (['trader deductions', 'trading activities', 'trading in financial instruments', 'trading in financial instruments/commodities'] as $needle) {
                if (str_contains($haystack, $needle)) {
                    return true;
                }
            }

            return false;
        }

        foreach (['trader in securities', 'trader deductions', 'trading activities', 'trading in financial instruments', 'trading in financial instruments/commodities'] as $needle) {
            if (str_contains($haystack, $needle)) {
                return true;
            }
        }

        return false;
    }
}
