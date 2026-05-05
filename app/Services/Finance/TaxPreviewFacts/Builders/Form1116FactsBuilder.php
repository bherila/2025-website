<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\TaxPreviewFacts\Data\Form1116Facts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class Form1116FactsBuilder extends TaxPreviewFactBuilder
{
    private const float ASSUMED_FOREIGN_WITHHOLDING_RATE = 0.15;

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     */
    public function build(array $k1Docs, array $docs1099): Form1116Facts
    {
        $passiveIncomeSources = [];
        $generalIncomeSources = [];
        $foreignTaxSources = [];
        $line4bSources = [];
        $sourcedByPartnerSources = [];
        $k1TaxAdded = [];
        $totalK1Box5 = 0.0;

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            $totalK1Box5 = $this->sumMoney([$totalK1Box5, $this->k1Field($data, '5')]);
            $breakdown = $this->k3IncomeBreakdown($data);
            if ($breakdown['sourcedByPartner'] !== 0.0) {
                $sourcedByPartnerSources[] = $this->k1Source(
                    $doc,
                    "{$partnerName} — K-3 sourced-by-partner income",
                    $breakdown['sourcedByPartner'],
                    TaxFactSourceType::K1ForeignTaxPassiveIncome,
                    TaxFactRouting::Form1116SourcedByPartner,
                    'K-3 sourced-by-partner income is surfaced so the election treatment is auditable.',
                    box: 'K-3',
                    notes: $this->sourcedByPartnerElection($data) ? 'Sourced-by-partner-as-U.S.-source election active.' : 'Election not active; sourced-by-partner amount is treated as foreign-source passive income.',
                );
            }

            $effectivePassiveIncome = $this->sourcedByPartnerElection($data)
                ? $breakdown['passiveIncome']
                : $this->sumMoney([$breakdown['passiveIncome'], $breakdown['sourcedByPartner']]);
            $foreignTax = $this->k1ForeignTaxTotal($data);

            if ($effectivePassiveIncome !== 0.0) {
                $passiveIncomeSources[] = $this->k1Source($doc, "{$partnerName} — K-3 passive income", $effectivePassiveIncome, TaxFactSourceType::K1ForeignTaxPassiveIncome, TaxFactRouting::Form1116Line1a, 'K-3 passive category income supports Form 1116 line 1a.', box: 'K-3');
            } elseif ($foreignTax > 0.0 && $breakdown['generalIncome'] === 0.0) {
                $passiveIncomeSources[] = $this->k1Source($doc, "{$partnerName} — Box 21 income estimated", $this->roundMoney($foreignTax / self::ASSUMED_FOREIGN_WITHHOLDING_RATE), TaxFactSourceType::K1ForeignTaxPassiveIncome, TaxFactRouting::Form1116Line1a, 'Gross foreign income is estimated from Box 21 foreign tax at the default 15% withholding rate.', box: '21');
            }

            if ($breakdown['generalIncome'] !== 0.0) {
                $generalIncomeSources[] = $this->k1Source($doc, "{$partnerName} — K-3 general income", $breakdown['generalIncome'], TaxFactSourceType::K1ForeignTaxGeneralIncome, TaxFactRouting::Form1116Line1a, 'K-3 general category income supports a separate Form 1116 category.', box: 'K-3');
            }

            if ($foreignTax > 0.0 && ! in_array($doc->id, $k1TaxAdded, true)) {
                $foreignTaxSources[] = $this->k1Source($doc, "{$partnerName} — K-1 Box 21 foreign tax", $foreignTax, TaxFactSourceType::K1ForeignTax, TaxFactRouting::Form1116Line8, 'K-1 Box 21 or K-3 Part III foreign tax supports Form 1116 line 8.', box: '21');
                $k1TaxAdded[] = $doc->id;
            }

            $line4b = $this->k3Line4bApportionment($data);
            if ($line4b !== null) {
                $line4bSources[] = $this->k1Source(
                    $doc,
                    "{$partnerName} — K-3 apportioned interest expense",
                    $line4b['line4b'],
                    TaxFactSourceType::K1ForeignTaxLine4b,
                    TaxFactRouting::Form1116Line4b,
                    'K-3 passive asset ratio apportions interest expense to Form 1116 line 4b.',
                    box: 'K-3',
                    notes: "Interest {$line4b['interestExpense']}; passive ratio {$line4b['passiveRatio']}",
                );
            }
        }

        foreach ($docs1099 as $doc) {
            foreach ($this->document1099DivEntries($doc) as $entry) {
                $foreignTax = $this->firstNumericValue($entry['parsedData'], ['box7_foreign_tax', 'div_7_foreign_tax']);
                if ($foreignTax === null || $foreignTax === 0.0) {
                    continue;
                }

                $payer = $this->payerName($doc, $entry['link'], $entry['parsedData']);
                $passiveIncomeSources[] = $this->documentSource($doc, $entry['link'], "{$payer} — 1099-DIV estimated foreign source income", $this->roundMoney($foreignTax / self::ASSUMED_FOREIGN_WITHHOLDING_RATE), TaxFactSourceType::Form1099DivForeignTax, TaxFactRouting::Form1116Line1a, '1099-DIV foreign-source income is estimated from Box 7 foreign tax at the default 15% withholding rate.', '1099_div', '7');
                $foreignTaxSources[] = $this->documentSource($doc, $entry['link'], "{$payer} — 1099-DIV Box 7 foreign tax", $foreignTax, TaxFactSourceType::Form1099DivForeignTax, TaxFactRouting::Form1116Line8, '1099-DIV Box 7 foreign tax supports Form 1116 line 8.', '1099_div', '7');
            }

            foreach ($this->document1099IntEntries($doc) as $entry) {
                $foreignTax = $this->firstNumericValue($entry['parsedData'], ['box6_foreign_tax', 'int_6_foreign_tax']);
                if ($foreignTax === null || $foreignTax === 0.0) {
                    continue;
                }

                $payer = $this->payerName($doc, $entry['link'], $entry['parsedData']);
                $foreignTaxSources[] = $this->documentSource($doc, $entry['link'], "{$payer} — 1099-INT Box 6 foreign tax", $foreignTax, TaxFactSourceType::Form1099IntForeignTax, TaxFactRouting::Form1116Line8, '1099-INT Box 6 foreign tax supports Form 1116 line 8.', '1099_int', '6');
            }
        }

        $totalForeignTaxes = $this->sumSources($foreignTaxSources);

        return new Form1116Facts(
            passiveIncomeSources: $passiveIncomeSources,
            totalPassiveIncome: $this->sumSources($passiveIncomeSources),
            generalIncomeSources: $generalIncomeSources,
            totalGeneralIncome: $this->sumSources($generalIncomeSources),
            foreignTaxSources: $foreignTaxSources,
            totalForeignTaxes: $totalForeignTaxes,
            line4bSources: $line4bSources,
            totalLine4b: $this->sumSources($line4bSources),
            sourcedByPartnerElectionSources: $sourcedByPartnerSources,
            totalSourcedByPartnerIncome: $this->sumSources($sourcedByPartnerSources),
            creditValue: $totalForeignTaxes,
            deductionValueAtThirtySevenPercent: $this->roundMoney($totalForeignTaxes * 0.37),
            recommendation: $totalForeignTaxes > 0.0 ? 'credit' : null,
            totalK1Box5: $this->roundMoney($totalK1Box5),
            turboTaxAlert: $totalK1Box5 > 0.0 && $this->sumSources($passiveIncomeSources) < ($totalK1Box5 * 0.5),
        );
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{passiveIncome:float,generalIncome:float,sourcedByPartner:float}
     */
    private function k3IncomeBreakdown(array $data): array
    {
        $section2 = $this->k3SectionData($data, 'part2_section2');
        $section1 = $this->k3SectionData($data, 'part2_section1');

        if ($section2 !== null) {
            $line55 = $this->sectionRow($section2, '55') ?? $this->canonicalLineRow($section2, 'line55_');
            if ($line55 !== null) {
                return [
                    'passiveIncome' => $this->rowColumn($line55, 'c'),
                    'generalIncome' => $this->rowColumn($line55, 'd'),
                    'sourcedByPartner' => $this->rowColumn($line55, 'f'),
                ];
            }
        }

        $passive = 0.0;
        $general = 0.0;
        $sourcedByPartner = 0.0;

        if ($section1 !== null) {
            foreach ($this->sectionRows($section1) as $row) {
                if (($row['country'] ?? null) === 'US') {
                    continue;
                }

                $passive = $this->sumMoney([$passive, $this->rowColumn($row, 'c')]);
                $general = $this->sumMoney([$general, $this->rowColumn($row, 'd')]);
                $sourcedByPartner = $this->sumMoney([$sourcedByPartner, $this->rowColumn($row, 'f')]);
            }
        }

        return [
            'passiveIncome' => $passive ?: $this->sumK1CodeItems($data, '16', 'B'),
            'generalIncome' => $general ?: $this->sumK1CodeItems($data, '16', 'C'),
            'sourcedByPartner' => $sourcedByPartner,
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function k1ForeignTaxTotal(array $data): float
    {
        $box21 = $this->k1Field($data, '21');
        $box16I = $this->sumK1CodeItems($data, '16', 'I');
        $box16J = $this->sumK1CodeItems($data, '16', 'J');
        $boxTotal = $this->sumMoney([$box21 > 0.0 ? $box21 : $box16I, $box16J]);

        return $boxTotal !== 0.0 ? $boxTotal : $this->k3ForeignTaxTotal($data);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function k3ForeignTaxTotal(array $data): float
    {
        $section = $this->k3SectionData($data, 'part3_section4');
        if ($section === null) {
            return 0.0;
        }

        foreach ($section as $key => $value) {
            if (! str_contains((string) $key, 'foreignTax') && ! str_contains((string) $key, 'foreign_tax')) {
                continue;
            }

            if (is_array($value)) {
                $grand = $this->parseMoney($value['grandTotalUSD'] ?? null);
                if ($grand !== null && $grand !== 0.0) {
                    return $grand;
                }
            }
        }

        return 0.0;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{interestExpense:float,passiveRatio:float,line4b:float}|null
     */
    private function k3Line4bApportionment(array $data): ?array
    {
        $passiveRatio = $this->k3PassiveAssetRatio($data);
        $section2 = $this->k3SectionData($data, 'part2_section2');
        if ($passiveRatio === null || $passiveRatio === 0.0 || $section2 === null) {
            return null;
        }

        $interestExpense = 0.0;
        foreach ($this->sectionRows($section2) as $row) {
            if (in_array((string) ($row['line'] ?? ''), ['39', '40', '41', '42', '43'], true)) {
                $interestExpense = $this->sumMoney([$interestExpense, $this->rowColumn($row, 'g')]);
            }
        }

        if ($interestExpense === 0.0) {
            return null;
        }

        return [
            'interestExpense' => $interestExpense,
            'passiveRatio' => $passiveRatio,
            'line4b' => $this->roundMoney($interestExpense * $passiveRatio),
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function k3PassiveAssetRatio(array $data): ?float
    {
        $section = $this->k3SectionData($data, 'part3_section2');
        if ($section === null) {
            return null;
        }

        if (is_numeric($section['derivedPassiveAssetRatio'] ?? null)) {
            return (float) $section['derivedPassiveAssetRatio'];
        }

        $row = $this->sectionRow($section, '6a') ?? $this->sectionRow($section, '1') ?? $this->canonicalLineRow($section, 'line6a_') ?? $this->canonicalLineRow($section, 'line1_');
        if ($row === null) {
            return null;
        }

        $total = $this->rowColumn($row, 'g');

        return $total !== 0.0 ? $this->rowColumn($row, 'c') / $total : null;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>|null
     */
    private function k3SectionData(array $data, string $sectionId): ?array
    {
        $sections = $data['k3']['sections'] ?? null;
        if (! is_array($sections)) {
            return null;
        }

        foreach ($sections as $section) {
            if (is_array($section) && ($section['sectionId'] ?? null) === $sectionId && is_array($section['data'] ?? null)) {
                return $section['data'];
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $section
     * @return array<int, array<string, mixed>>
     */
    private function sectionRows(array $section): array
    {
        if (is_array($section['rows'] ?? null)) {
            return array_values(array_filter($section['rows'], 'is_array'));
        }

        $rows = [];
        foreach ($section as $value) {
            if (! is_array($value) || ! is_array($value['rows'] ?? null)) {
                continue;
            }

            foreach ($value['rows'] as $row) {
                if (is_array($row)) {
                    $rows[] = $row;
                }
            }
        }

        return $rows;
    }

    /**
     * @param  array<string, mixed>  $section
     * @return array<string, mixed>|null
     */
    private function sectionRow(array $section, string $line): ?array
    {
        foreach ($this->sectionRows($section) as $row) {
            if ((string) ($row['line'] ?? '') === $line) {
                return $row;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $section
     * @return array<string, mixed>|null
     */
    private function canonicalLineRow(array $section, string $prefix): ?array
    {
        foreach ($section as $key => $value) {
            if (str_starts_with((string) $key, $prefix) && is_array($value)) {
                return $value;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function rowColumn(array $row, string $column): float
    {
        $canonical = $this->parseMoney($row[$column] ?? null);
        if ($canonical !== null) {
            return $canonical;
        }

        $toolKey = match ($column) {
            'c' => 'col_c_passive',
            'd' => 'col_d_general',
            'f' => 'col_f_sourced_by_partner',
            'g' => 'col_g_total',
            default => null,
        };

        return $toolKey !== null ? ($this->parseMoney($row[$toolKey] ?? null) ?? 0.0) : 0.0;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function sourcedByPartnerElection(array $data): bool
    {
        return (bool) ($data['k3Elections']['sourcedByPartnerAsUSSource'] ?? false);
    }

    private function k1Source(FileForTaxDocument $doc, string $label, float $amount, TaxFactSourceType $sourceType, TaxFactRouting $routing, string $routingReason, ?string $box = null, ?string $notes = null): TaxFactSource
    {
        return new TaxFactSource(
            id: "k1-{$doc->id}-{$sourceType->value}-".md5($label),
            label: $label,
            amount: $this->roundMoney($amount),
            sourceType: $sourceType,
            taxDocumentId: $doc->id,
            formType: $this->formType($doc),
            box: $box,
            routing: $routing,
            routingReason: $routingReason,
            notes: $notes,
            isReviewed: $this->sourceIsReviewed($doc),
            reviewStatus: $this->reviewStatus($doc),
            reviewAction: $this->reviewAction($doc),
        );
    }

    private function documentSource(FileForTaxDocument $doc, ?TaxDocumentAccount $link, string $label, float $amount, TaxFactSourceType $sourceType, TaxFactRouting $routing, string $routingReason, string $formType, string $box): TaxFactSource
    {
        $idPrefix = $link instanceof TaxDocumentAccount ? "link-{$link->id}" : "doc-{$doc->id}";

        return new TaxFactSource(
            id: "{$idPrefix}-{$sourceType->value}-{$box}",
            label: $label,
            amount: $this->roundMoney($amount),
            sourceType: $sourceType,
            taxDocumentId: $doc->id,
            taxDocumentAccountId: $link?->id,
            accountId: $link?->account_id,
            formType: $formType,
            box: $box,
            routing: $routing,
            routingReason: $routingReason,
            isReviewed: $this->sourceIsReviewed($doc, $link),
            reviewStatus: $this->reviewStatus($doc, $link),
            reviewAction: $this->reviewAction($doc, $link),
        );
    }
}
