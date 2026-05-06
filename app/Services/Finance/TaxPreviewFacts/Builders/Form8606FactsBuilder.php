<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Enums\Finance\DeductionCategory;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\UserDeduction;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\TaxPreviewFacts\Data\Form8606Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8606SourceRowFact;

class Form8606FactsBuilder extends TaxPreviewFactBuilder
{
    private const array ROTH_CONVERSION_CODES = ['2', '7', 'G'];

    /**
     * @param  FileForTaxDocument[]  $docs1099
     * @param  UserDeduction[]  $userDeductions
     */
    public function build(array $docs1099, array $userDeductions): Form8606Facts
    {
        $rows = array_values(array_filter(
            array_map(fn (FileForTaxDocument $doc): ?Form8606SourceRowFact => $this->sourceRow($doc), $docs1099),
            static fn (?Form8606SourceRowFact $row): bool => $row instanceof Form8606SourceRowFact && $row->isIra,
        ));

        $conversions = [];
        $distributions = [];
        foreach ($rows as $row) {
            if (in_array(strtoupper($row->distributionCode), self::ROTH_CONVERSION_CODES, true)) {
                $conversions[] = $row;

                continue;
            }

            $distributions[] = $row;
        }

        $line1 = $this->manualTotal($userDeductions, DeductionCategory::Form8606NondeductibleContributions->value);
        $line2 = $this->manualTotal($userDeductions, DeductionCategory::Form8606PriorYearBasis->value);
        $line3 = $this->sumMoney([$line1, $line2]);
        $line6 = $this->manualTotal($userDeductions, DeductionCategory::Form8606YearEndFmv->value);
        $line7 = $this->sumSourceRows($distributions);
        $line8 = $this->sumSourceRows($conversions);
        $line9 = $this->sumMoney([$line6, $line7, $line8]);
        $line10 = $line9 > 0.0 ? min(1.0, round($line3 / $line9, 5)) : 0.0;
        $line11 = MoneyMath::round($line8 * $line10);
        $line12 = MoneyMath::round($line7 * $line10);
        $line13 = $this->sumMoney([$line11, $line12]);
        $line14 = $this->subtractMoney($line3, $line13);
        $line15c = $this->subtractMoney($line7, $line12);
        $line18 = $this->subtractMoney($line8, $line11);

        return new Form8606Facts(
            line1_nondeductibleContributions: $line1,
            line2_priorYearBasis: $line2,
            line3_totalBasis: $line3,
            line6_yearEndFmv: $line6,
            line7_distributionsNotConverted: $line7,
            line8_convertedToRoth: $line8,
            line9_total: $line9,
            line10_proRataRatio: $line10,
            line11_basisInConversion: $line11,
            line12_basisInDistributions: $line12,
            line13_totalBasisUsed: $line13,
            line14_basisCarriedForward: $line14,
            line15c_taxableDistributions: $line15c,
            line18_taxableConversions: $line18,
            taxableToForm1040Line4b: $this->sumMoney([$line15c, $line18]),
            conversions: $conversions,
            distributions: $distributions,
            hasActivity: $line1 !== 0.0 || $line2 !== 0.0 || $line6 !== 0.0 || $line7 !== 0.0 || $line8 !== 0.0,
        );
    }

    private function sourceRow(FileForTaxDocument $doc): ?Form8606SourceRowFact
    {
        if ($this->formType($doc) !== '1099_r' || ! is_array($doc->parsed_data)) {
            return null;
        }

        $gross = $this->firstNumericValue($doc->parsed_data, ['box1_gross_distribution', 'gross_distribution']);
        if ($gross === null || $gross === 0.0) {
            return null;
        }

        $payerName = $doc->parsed_data['payer_name'] ?? null;
        $distributionCode = $doc->parsed_data['box7_distribution_code'] ?? $doc->parsed_data['distribution_code'] ?? '';

        return new Form8606SourceRowFact(
            payerName: is_string($payerName) && trim($payerName) !== '' ? $payerName : ($doc->original_filename ?? '1099-R'),
            grossDistribution: $gross,
            taxableAmount: $this->firstNumericValue($doc->parsed_data, ['box2a_taxable_amount', 'taxable_amount']) ?? 0.0,
            distributionCode: is_string($distributionCode) || is_numeric($distributionCode) ? trim((string) $distributionCode) : '',
            isIra: (bool) ($doc->parsed_data['box7_ira_sep_simple'] ?? $doc->parsed_data['ira_sep_simple'] ?? false),
        );
    }

    /**
     * @param  UserDeduction[]  $userDeductions
     */
    private function manualTotal(array $userDeductions, string $category): float
    {
        $total = 0.0;

        foreach ($userDeductions as $deduction) {
            if ($deduction->category !== $category) {
                continue;
            }

            $total = $this->sumMoney([$total, (float) $deduction->amount]);
        }

        return $total;
    }

    /**
     * @param  Form8606SourceRowFact[]  $rows
     */
    private function sumSourceRows(array $rows): float
    {
        return $this->sumMoney(array_map(static fn (Form8606SourceRowFact $row): float => $row->grossDistribution, $rows));
    }
}
