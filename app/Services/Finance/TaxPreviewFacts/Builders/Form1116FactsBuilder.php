<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\TaxPreviewFacts\Data\Form1116Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952Facts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use Illuminate\Support\Facades\Log;

class Form1116FactsBuilder extends TaxPreviewFactBuilder
{
    private const float ASSUMED_FOREIGN_WITHHOLDING_RATE = 0.15;

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     */
    public function build(array $k1Docs, array $docs1099, ?Form4952Facts $form4952 = null): Form1116Facts
    {
        $passiveIncomeSources = [];
        $generalIncomeSources = [];
        $foreignTaxSources = [];
        $line4bSources = [];
        $sourcedByPartnerSources = [];
        $k1TaxAdded = [];
        $totalK1Box5 = 0.0;
        $form4952InterestByK1Doc = $this->form4952InterestExpenseByK1Doc($k1Docs, $form4952);

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            $totalK1Box5 = $this->sumMoney([$totalK1Box5, $this->k1Field($data, '5')]);
            $breakdown = $this->k3IncomeBreakdown($data);
            $sbpTreatedAsUSSource = $this->sourcedByPartnerTreatedAsUSSource($data);
            if ($breakdown['sourcedByPartner'] !== 0.0) {
                $sourcedByPartnerNotes = $sbpTreatedAsUSSource
                    ? 'K-3 line 24 sourced-by-partner amount is treated as U.S.-source under the default U.S.-person partner-level sourcing rule and excluded from Form 1116 foreign-source passive income.'
                    : 'Treaty / non-U.S.-partner treatment selected (sourcedByPartnerAsUSSource = false); sourced-by-partner amount is included in Form 1116 foreign-source passive income.';
                $sourcedByPartnerSources[] = $this->k1Source(
                    $doc,
                    "{$partnerName} — K-3 sourced-by-partner income",
                    $breakdown['sourcedByPartner'],
                    TaxFactSourceType::K1ForeignTaxPassiveIncome,
                    TaxFactRouting::Form1116SourcedByPartner,
                    'K-3 sourced-by-partner income is surfaced so the election treatment is auditable.',
                    box: 'K-3',
                    notes: $sourcedByPartnerNotes,
                );
            }

            $effectivePassiveIncome = $sbpTreatedAsUSSource
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

            $line4b = $this->k3Line4bApportionment($data, $form4952InterestByK1Doc[$doc->id] ?? null);
            if ($line4b !== null) {
                $line4bSources[] = $this->k1Source(
                    $doc,
                    "{$partnerName} — K-3 apportioned interest expense",
                    $line4b['line4b'],
                    TaxFactSourceType::K1ForeignTaxLine4b,
                    TaxFactRouting::Form1116Line4b,
                    'K-3 passive asset ratio apportions interest expense to Form 1116 line 4b.',
                    box: 'K-3',
                    notes: "Interest {$line4b['interestExpense']}; passive ratio {$line4b['passiveRatio']}; passive other deductions {$line4b['passiveOtherDeductions']}",
                );
            }
        }

        foreach ($docs1099 as $doc) {
            foreach ($this->document1099DivEntries($doc) as $entry) {
                $foreignTax = $this->foreignTaxFrom1099Div($entry['parsedData']);
                if ($foreignTax === null || $foreignTax === 0.0) {
                    continue;
                }

                $payer = $this->payerName($doc, $entry['link'], $entry['parsedData']);
                $foreignIncome = $this->foreignSourceIncomeFrom1099Div($entry['parsedData'], $foreignTax);
                $incomeIsEstimated = $foreignIncome['isEstimated'];
                $passiveIncomeSources[] = $this->documentSource(
                    $doc,
                    $entry['link'],
                    $incomeIsEstimated ? "{$payer} — 1099-DIV estimated foreign source income" : "{$payer} — 1099-DIV foreign source income",
                    $foreignIncome['amount'],
                    TaxFactSourceType::Form1099DivForeignTax,
                    TaxFactRouting::Form1116Line1a,
                    $incomeIsEstimated
                        ? '1099-DIV foreign-source income is estimated from Box 7 foreign tax at the default 15% withholding rate.'
                        : '1099-DIV foreign-source income comes from the broker foreign income and taxes summary.',
                    '1099_div',
                    '7',
                    $incomeIsEstimated ? false : null,
                    $incomeIsEstimated ? 'needs_review' : null,
                    $incomeIsEstimated ? 'Confirm gross foreign-source dividend income; this source is estimated from 1099-DIV Box 7 foreign tax.' : null,
                );
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

        $totalPassiveIncome = $this->sumSources($passiveIncomeSources);
        $totalLine4b = $this->sumSources($line4bSources);
        $totalForeignTaxes = $this->sumSources($foreignTaxSources);

        return new Form1116Facts(
            passiveIncomeSources: $passiveIncomeSources,
            totalPassiveIncome: $totalPassiveIncome,
            generalIncomeSources: $generalIncomeSources,
            totalGeneralIncome: $this->sumSources($generalIncomeSources),
            foreignTaxSources: $foreignTaxSources,
            totalForeignTaxes: $totalForeignTaxes,
            line4bSources: $line4bSources,
            totalLine4b: $totalLine4b,
            netForeignSourceTaxableIncome: $this->subtractMoney($totalPassiveIncome, $totalLine4b),
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
     * @return array{passiveIncome:float,generalIncome:float,sourcedByPartner:float,sourcedByPartnerIsUsSource:bool}
     */
    private function k3IncomeBreakdown(array $data): array
    {
        $section2 = $this->k3SectionData($data, 'part2_section2');
        $section1 = $this->k3SectionData($data, 'part2_section1');

        $line24 = $this->k3Part2Line24($section1);
        if ($line24 !== null) {
            return $line24;
        }

        if ($section2 !== null) {
            $line55 = $this->sectionRow($section2, '55') ?? $this->canonicalLineRow($section2, 'line55_');
            if ($line55 !== null) {
                return [
                    'passiveIncome' => $this->rowColumn($line55, 'c'),
                    'generalIncome' => $this->rowColumn($line55, 'd'),
                    'sourcedByPartner' => $this->rowColumn($line55, 'f'),
                    'sourcedByPartnerIsUsSource' => true,
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
            'sourcedByPartnerIsUsSource' => true,
        ];
    }

    /**
     * @param  array<string, mixed>|null  $section1
     * @return array{passiveIncome:float,generalIncome:float,sourcedByPartner:float,sourcedByPartnerIsUsSource:bool}|null
     */
    private function k3Part2Line24(?array $section1): ?array
    {
        if ($section1 === null) {
            return null;
        }

        $line24 = $this->canonicalLineRow($section1, 'line24_');
        if ($line24 === null) {
            return null;
        }

        $totals = $line24['totals'] ?? null;
        if (is_array($totals)) {
            return [
                'passiveIncome' => $this->rowColumn($totals, 'c'),
                'generalIncome' => $this->rowColumn($totals, 'd'),
                'sourcedByPartner' => $this->rowColumn($totals, 'f'),
                'sourcedByPartnerIsUsSource' => true,
            ];
        }

        $passive = 0.0;
        $general = 0.0;
        $sourcedByPartner = 0.0;
        foreach ($this->sectionRows($line24) as $row) {
            if (($row['country'] ?? null) === 'US') {
                continue;
            }

            $passive = $this->sumMoney([$passive, $this->rowColumn($row, 'c')]);
            $general = $this->sumMoney([$general, $this->rowColumn($row, 'd')]);
            $sourcedByPartner = $this->sumMoney([$sourcedByPartner, $this->rowColumn($row, 'f')]);
        }

        return [
            'passiveIncome' => $passive,
            'generalIncome' => $general,
            'sourcedByPartner' => $sourcedByPartner,
            'sourcedByPartnerIsUsSource' => true,
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

        $topLevelGrand = $this->parseMoney($section['grandTotalUSD'] ?? null);
        if ($topLevelGrand !== null && $topLevelGrand !== 0.0) {
            return $topLevelGrand;
        }

        if (is_array($section['countries'] ?? null)) {
            return $this->sumMoney(array_map(
                fn (mixed $country): float => is_array($country)
                    ? ($this->parseMoney($country['amount_usd'] ?? $country['total'] ?? $country['passiveForeign'] ?? null) ?? 0.0)
                    : 0.0,
                $section['countries'],
            ));
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
     * @return array{interestExpense:float,passiveRatio:float,line4b:float,passiveOtherDeductions:float}|null
     */
    private function k3Line4bApportionment(array $data, ?float $allocatedInvestmentInterestExpense = null): ?array
    {
        $passiveRatio = $this->k3PassiveAssetRatio($data);
        $section2 = $this->k3SectionData($data, 'part2_section2');
        if ($passiveRatio === null || $passiveRatio === 0.0 || $section2 === null) {
            return null;
        }

        $interestExpense = $allocatedInvestmentInterestExpense !== null
            ? $allocatedInvestmentInterestExpense
            : $this->k3InterestExpense($section2);
        $passiveOtherDeductions = $this->k3PassiveOtherDeductions($section2);
        $line4b = $this->roundMoney(($interestExpense * $passiveRatio) + $passiveOtherDeductions);

        if ($line4b === 0.0) {
            return null;
        }

        return [
            'interestExpense' => $interestExpense,
            'passiveRatio' => $passiveRatio,
            'line4b' => $line4b,
            'passiveOtherDeductions' => $passiveOtherDeductions,
        ];
    }

    /**
     * Allocate Form 4952 investment interest expense across eligible K-1s for Form 1116 line 4b.
     *
     * Per the line 4b instructions, interest "directly related" to a category (here: tagged to a
     * specific K-1 via taxDocumentId) stays on that K-1, and "indirect" interest is apportioned
     * across all eligible categories by an asset-basis ratio. The remainder distribution
     * intentionally includes already-tagged K-1s — the indirect bucket is conceptually separate
     * and applies to every eligible category, including the directly-tagged ones.
     *
     * @param  FileForTaxDocument[]  $k1Docs
     * @return array<int, float>
     */
    private function form4952InterestExpenseByK1Doc(array $k1Docs, ?Form4952Facts $form4952): array
    {
        if (! $form4952 instanceof Form4952Facts || $form4952->totalInvestmentInterestExpense <= 0.0) {
            return [];
        }

        $allocations = [];
        $weights = [];
        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null || $this->k3SectionData($data, 'part2_section2') === null) {
                continue;
            }

            $passiveRatio = $this->k3PassiveAssetRatio($data);
            if ($passiveRatio === null || $passiveRatio === 0.0) {
                continue;
            }

            $allocations[$doc->id] = 0.0;
            $weights[$doc->id] = abs($passiveRatio);
        }

        if ($allocations === []) {
            return [];
        }

        foreach ($form4952->investmentInterestSources as $source) {
            if ($source->taxDocumentId !== null && array_key_exists($source->taxDocumentId, $allocations)) {
                // Form 4952 sources can be stored signed; line 4b expects positive expense.
                $allocations[$source->taxDocumentId] = $this->sumMoney([$allocations[$source->taxDocumentId], abs($source->amount)]);
            }
        }

        $docSpecificTotal = $this->sumMoney(array_values($allocations));
        if ($docSpecificTotal > $form4952->totalInvestmentInterestExpense && $docSpecificTotal !== 0.0) {
            Log::warning('Form 1116 line 4b: tagged K-1 interest exceeds Form 4952 total; scaling down', [
                'docSpecificTotal' => $docSpecificTotal,
                'totalInvestmentInterestExpense' => $form4952->totalInvestmentInterestExpense,
                'docIds' => array_keys($allocations),
            ]);
            $scale = $form4952->totalInvestmentInterestExpense / $docSpecificTotal;
            foreach ($allocations as $docId => $amount) {
                $allocations[$docId] = $amount * $scale;
            }

            return $allocations;
        }

        $unassignedInterest = $this->subtractMoney($form4952->totalInvestmentInterestExpense, $docSpecificTotal);
        if ($unassignedInterest <= 0.0) {
            return $allocations;
        }

        // Weights are abs(passiveRatio) and we filtered out zero ratios above, so $weightTotal > 0.
        $weightTotal = array_sum($weights);
        foreach ($weights as $docId => $weight) {
            $share = $unassignedInterest * ($weight / $weightTotal);
            $allocations[$docId] = $this->sumMoney([$allocations[$docId], $share]);
        }

        return $allocations;
    }

    /**
     * @param  array<string, mixed>  $section2
     */
    private function k3InterestExpense(array $section2): float
    {
        return $this->k3SectionLineColumnTotal($section2, ['39', '40', '41', '42', '43'], 'g');
    }

    /**
     * @param  array<string, mixed>  $section2
     */
    private function k3PassiveOtherDeductions(array $section2): float
    {
        return $this->k3SectionLineColumnTotal($section2, ['49', '50'], 'c');
    }

    /**
     * @param  array<string, mixed>  $section
     * @param  string[]  $lines
     */
    private function k3SectionLineColumnTotal(array $section, array $lines, string $column): float
    {
        $total = 0.0;
        $linesFoundInRows = [];
        foreach ($this->sectionRows($section) as $row) {
            $line = (string) ($row['line'] ?? '');
            if (in_array($line, $lines, true)) {
                $total = $this->sumMoney([$total, $this->rowColumn($row, $column)]);
                $linesFoundInRows[$line] = true;
            }
        }

        foreach ($section as $key => $value) {
            if (! is_array($value)) {
                continue;
            }

            $matches = [];
            if (! preg_match('/^line(\w+?)_/', (string) $key, $matches)) {
                continue;
            }

            $line = $matches[1];
            if (in_array($line, $lines, true) && ! isset($linesFoundInRows[$line])) {
                $total = $this->sumMoney([$total, $this->rowColumn($value, $column)]);
            }
        }

        return $total;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function foreignTaxFrom1099Div(array $data): ?float
    {
        $value = $this->firstNumericOrNestedValue($data, ['box7_foreign_tax', 'div_7_foreign_tax'], ['7_foreign_tax_paid']);

        return $value !== null ? abs($value) : null;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{amount:float,isEstimated:bool}
     */
    private function foreignSourceIncomeFrom1099Div(array $data, float $foreignTax): array
    {
        $summary = $data['foreign_income_and_taxes_summary'] ?? null;
        $summaryIncome = is_array($summary)
            ? $this->parseMoney($summary['total_foreign_source_income'] ?? null)
            : null;
        $directIncome = $summaryIncome ?? $this->firstNumericValue($data, ['foreign_source_income', 'total_foreign_source_income']);

        if ($directIncome !== null && $directIncome !== 0.0) {
            return ['amount' => abs($directIncome), 'isEstimated' => false];
        }

        return [
            'amount' => $this->roundMoney(abs($foreignTax) / self::ASSUMED_FOREIGN_WITHHOLDING_RATE),
            'isEstimated' => true,
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
     * U.S.-source is the default for K-3 Part II column (f) "sourced by partner" amounts,
     * because partner-level sourcing under §§861–865 generally resources that income to
     * the U.S. for U.S.-person partners. The election flag is read so that taxpayers who
     * are non-U.S. partners or who are sourcing under a treaty can explicitly opt out by
     * setting `sourcedByPartnerAsUSSource` to `false`, in which case column (f) is treated
     * as foreign-source passive income for Form 1116.
     *
     * @param  array<string, mixed>  $data
     */
    private function sourcedByPartnerTreatedAsUSSource(array $data): bool
    {
        return ($data['k3Elections']['sourcedByPartnerAsUSSource'] ?? null) !== false;
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

    private function documentSource(
        FileForTaxDocument $doc,
        ?TaxDocumentAccount $link,
        string $label,
        float $amount,
        TaxFactSourceType $sourceType,
        TaxFactRouting $routing,
        string $routingReason,
        string $formType,
        string $box,
        ?bool $isReviewed = null,
        ?string $reviewStatus = null,
        ?string $reviewAction = null,
    ): TaxFactSource {
        $idPrefix = $link instanceof TaxDocumentAccount ? "link-{$link->id}" : "doc-{$doc->id}";
        $sourceIsReviewed = $isReviewed ?? $this->sourceIsReviewed($doc, $link);

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
            isReviewed: $sourceIsReviewed,
            reviewStatus: $reviewStatus ?? ($sourceIsReviewed ? 'reviewed' : 'needs_review'),
            reviewAction: $reviewAction ?? ($sourceIsReviewed ? null : $this->reviewAction($doc, $link)),
        );
    }
}
