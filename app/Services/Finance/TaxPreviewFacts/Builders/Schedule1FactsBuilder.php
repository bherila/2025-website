<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\TaxPreviewFacts\Data\Schedule1Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleCFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleFFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleSEFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use LogicException;

class Schedule1FactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     */
    public function build(array $k1Docs, array $docs1099, ?ScheduleCFacts $scheduleC = null, ?ScheduleSEFacts $scheduleSE = null, ?ScheduleFFacts $scheduleF = null): Schedule1Facts
    {
        $line3Sources = $scheduleC instanceof ScheduleCFacts ? $this->scheduleCLine3Sources($scheduleC) : [];
        $line5Sources = [];
        $line6Sources = $scheduleF instanceof ScheduleFFacts ? $this->scheduleFLine6Sources($scheduleF) : [];

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            $box1 = $this->k1Field($data, '1');
            $box2 = $this->k1Field($data, '2');
            $box3 = $this->k1Field($data, '3');
            $box4 = $this->k1Field($data, '4');
            $box11ZZ = $this->sumK1CodeItems($data, '11', 'ZZ');
            $box13ZZ = $this->sumAbsK1CodeItems($data, '13', 'ZZ');
            $amount = $this->sumMoney([$box1, $box2, $box3, $box4, $box11ZZ, -$box13ZZ]);

            if ($amount === 0.0) {
                continue;
            }

            $line5Sources[] = new TaxFactSource(
                id: "k1-{$doc->id}-schedule1-line5",
                label: "{$partnerName} — Schedule E net income/loss",
                amount: $amount,
                sourceType: TaxFactSourceType::K1ScheduleENet,
                taxDocumentId: $doc->id,
                formType: $this->formType($doc),
                routing: TaxFactRouting::Schedule1Line5,
                routingReason: 'K-1 ordinary, rental, and Schedule E partnership-statement sources flow through Schedule E to Schedule 1 line 5.',
                notes: "Box 1 {$box1}; Box 2 {$box2}; Box 3 {$box3}; Box 4 {$box4}; Box 11ZZ {$box11ZZ}; Box 13ZZ -{$box13ZZ}",
                isReviewed: $this->sourceIsReviewed($doc),
                reviewStatus: $this->reviewStatus($doc),
                reviewAction: $this->reviewAction($doc),
            );
        }

        $line8Sources = $this->schedule1Line8Sources($docs1099);
        $line8bSources = $this->schedule1Line8SourcesFor($line8Sources, '8b');
        $line8hSources = $this->schedule1Line8SourcesFor($line8Sources, '8h');
        $line8iSources = $this->schedule1Line8SourcesFor($line8Sources, '8i');
        $line8zSources = $this->schedule1Line8SourcesFor($line8Sources, '8z');
        $line8bTotal = $this->sumSources($line8bSources);
        $line8hTotal = $this->sumSources($line8hSources);
        $line8iTotal = $this->sumSources($line8iSources);
        $line8zTotal = $this->sumSources($line8zSources);

        return new Schedule1Facts(
            line3Sources: $line3Sources,
            line3Total: $this->sumSources($line3Sources),
            line5Sources: $line5Sources,
            line5Total: $this->sumSources($line5Sources),
            line6Sources: $line6Sources,
            line6Total: $this->sumSources($line6Sources),
            line8Sources: $line8Sources,
            line8bSources: $line8bSources,
            line8bTotal: $line8bTotal,
            line8hSources: $line8hSources,
            line8hTotal: $line8hTotal,
            line8iSources: $line8iSources,
            line8iTotal: $line8iTotal,
            line8zSources: $line8zSources,
            line8zTotal: $line8zTotal,
            line9TotalOtherIncome: $this->sumMoney([$line8bTotal, $line8hTotal, $line8iTotal, $line8zTotal]),
            line15Sources: $scheduleSE instanceof ScheduleSEFacts ? $this->scheduleSELine15Sources($scheduleSE) : [],
            line15Total: $scheduleSE instanceof ScheduleSEFacts ? $scheduleSE->deductibleSeTax : 0.0,
        );
    }

    /**
     * @return TaxFactSource[]
     */
    private function scheduleCLine3Sources(ScheduleCFacts $scheduleC): array
    {
        return array_map(
            fn (TaxFactSource $source): TaxFactSource => $this->cloneSource($source, TaxFactRouting::Schedule1Line3, 'Schedule C line 31 flows to Schedule 1 line 3.'),
            $scheduleC->line31Sources,
        );
    }

    /**
     * @return TaxFactSource[]
     */
    private function scheduleFLine6Sources(ScheduleFFacts $scheduleF): array
    {
        return array_map(
            fn (TaxFactSource $source): TaxFactSource => $this->cloneSource($source, TaxFactRouting::Schedule1Line6, 'Schedule F line 34 flows to Schedule 1 line 6.'),
            $scheduleF->line34Sources,
        );
    }

    /**
     * @return TaxFactSource[]
     */
    private function scheduleSELine15Sources(ScheduleSEFacts $scheduleSE): array
    {
        if ($scheduleSE->deductibleSeTax === 0.0) {
            return [];
        }

        return [
            new TaxFactSource(
                id: 'schedule-se-schedule1-line15',
                label: 'Deductible half of self-employment tax',
                amount: $scheduleSE->deductibleSeTax,
                sourceType: TaxFactSourceType::ScheduleSEDeductibleTax,
                routing: TaxFactRouting::Schedule1Line15,
                routingReason: 'Schedule SE line 13 flows to Schedule 1 line 15.',
                notes: "Schedule SE tax {$scheduleSE->seTax}",
            ),
        ];
    }

    private function cloneSource(TaxFactSource $source, TaxFactRouting $routing, string $routingReason): TaxFactSource
    {
        $sourceType = TaxFactSourceType::tryFrom($source->sourceType);
        if (! $sourceType instanceof TaxFactSourceType) {
            throw new LogicException("Cannot clone tax fact source {$source->id} because source type {$source->sourceType} is not recognized.");
        }

        return new TaxFactSource(
            id: "{$source->id}-schedule1",
            label: $source->label,
            amount: $source->amount,
            sourceType: $sourceType,
            taxDocumentId: $source->taxDocumentId,
            taxDocumentAccountId: $source->taxDocumentAccountId,
            accountId: $source->accountId,
            formType: $source->formType,
            box: $source->box,
            code: $source->code,
            routing: $routing,
            routingReason: $routingReason,
            notes: $source->notes,
            isReviewed: $source->isReviewed,
            reviewStatus: $source->reviewStatus,
            reviewAction: $source->reviewAction,
        );
    }

    /**
     * @param  FileForTaxDocument[]  $docs1099
     * @return TaxFactSource[]
     */
    private function schedule1Line8Sources(array $docs1099): array
    {
        $sources = [];

        foreach ($docs1099 as $doc) {
            $links = $doc->accountLinks;
            if ($links->isNotEmpty()) {
                foreach ($links as $link) {
                    if (! $link instanceof TaxDocumentAccount || $link->form_type !== '1099_misc') {
                        continue;
                    }

                    $entryData = $this->parsedDataForLink($doc, $link);
                    if ($entryData === null) {
                        continue;
                    }

                    $routing = $link->misc_routing ?? $doc->misc_routing;
                    if (! $this->routesToLine8($routing)) {
                        continue;
                    }

                    $amount = $this->miscAmount($entryData);
                    if ($amount === null || $amount === 0.0) {
                        continue;
                    }

                    $sources[] = $this->miscSource($doc, $link, $entryData, $amount, $routing);
                }

                continue;
            }

            if ($this->formType($doc) !== '1099_misc' || ! is_array($doc->parsed_data)) {
                continue;
            }

            $routing = $doc->misc_routing;
            if (! $this->routesToLine8($routing)) {
                continue;
            }

            $amount = $this->miscAmount($doc->parsed_data);
            if ($amount === null) {
                continue;
            }

            $sources[] = $this->miscSource($doc, null, $doc->parsed_data, $amount, $routing);
        }

        return $sources;
    }

    /**
     * @param  TaxFactSource[]  $sources
     * @return TaxFactSource[]
     */
    private function schedule1Line8SourcesFor(array $sources, string $line): array
    {
        return array_values(array_filter(
            $sources,
            fn (TaxFactSource $source): bool => $this->schedule1Line8Destination($source->routing) === $line,
        ));
    }

    private function schedule1Line8Destination(?string $routing): string
    {
        return match ($routing) {
            'sch_1_8b' => '8b',
            'sch_1_8h' => '8h',
            'sch_1_8i' => '8i',
            default => '8z',
        };
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function miscSource(
        FileForTaxDocument $doc,
        ?TaxDocumentAccount $link,
        array $parsedData,
        float $amount,
        ?string $routing,
    ): TaxFactSource {
        $payer = $this->payerName($doc, $link, $parsedData);
        $factRouting = $this->line8FactRouting($routing);
        $line = $this->schedule1Line8Destination($routing);

        return new TaxFactSource(
            id: $link instanceof TaxDocumentAccount ? "link-{$link->id}-schedule1-{$line}" : "doc-{$doc->id}-schedule1-{$line}",
            label: "{$payer} — 1099-MISC other income",
            amount: $amount,
            sourceType: TaxFactSourceType::Form1099MiscOtherIncome,
            taxDocumentId: $doc->id,
            taxDocumentAccountId: $link?->id,
            accountId: $link?->account_id,
            formType: '1099_misc',
            routing: $factRouting,
            routingReason: $this->miscRoutingReason($routing, $factRouting),
            notes: $this->miscBreakdownNote($parsedData),
            isReviewed: $this->sourceIsReviewed($doc, $link),
            reviewStatus: $this->reviewStatus($doc, $link),
            reviewAction: $this->reviewAction($doc, $link),
        );
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function miscAmount(array $parsedData): ?float
    {
        return $this->sumMiscValues($parsedData);
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function miscBreakdownNote(array $parsedData): string
    {
        $parts = [];
        foreach (self::MISC_PRIMARY_BOX_KEYS as $key) {
            $value = $this->numericValue($parsedData, $key);
            if ($value !== null && $value !== 0.0) {
                $parts[] = "{$key} {$value}";
            }
        }
        foreach ([
            '1_rents',
            '2_royalties',
            '3_other_income',
            '8_substitute_payments_in_lieu_of_dividends_or_interest',
        ] as $key) {
            $value = $this->nestedBoxValue($parsedData, $key);
            if ($value !== null && $value !== 0.0) {
                $parts[] = "boxes.{$key} {$value}";
            }
        }

        return implode('; ', $parts);
    }

    private function routesToLine8(?string $routing): bool
    {
        return $routing === null || in_array($routing, self::LINE_8_ROUTINGS, true);
    }

    private function line8FactRouting(?string $routing): TaxFactRouting
    {
        if ($routing === null) {
            return TaxFactRouting::DefaultSchedule18z;
        }

        return TaxFactRouting::tryFrom($routing) ?? TaxFactRouting::DefaultSchedule18z;
    }

    private function miscRoutingReason(?string $routing, TaxFactRouting $factRouting): string
    {
        if ($routing === null) {
            return 'Unrouted 1099-MISC defaults to Schedule 1 line 8z unless explicitly routed to Schedule C or Schedule E.';
        }

        if ($factRouting === TaxFactRouting::DefaultSchedule18z) {
            return "Unknown 1099-MISC routing '{$routing}' was treated as the Schedule 1 line 8z default.";
        }

        return '1099-MISC routing explicitly targets the Schedule 1 line 8 family.';
    }
}
