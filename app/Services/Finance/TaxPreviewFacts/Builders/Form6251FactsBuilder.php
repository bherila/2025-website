<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\TaxPreviewFacts\Data\Form6251Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form6251SourceEntryFact;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleAFacts;

class Form6251FactsBuilder extends TaxPreviewFactBuilder
{
    private const int DEFAULT_AMT_YEAR = 2025;

    private const array AMT_EXEMPTION = [
        2018 => ['single' => 70300.0, 'mfj' => 109400.0],
        2019 => ['single' => 71700.0, 'mfj' => 111700.0],
        2020 => ['single' => 72900.0, 'mfj' => 113400.0],
        2021 => ['single' => 73600.0, 'mfj' => 114600.0],
        2022 => ['single' => 75900.0, 'mfj' => 118100.0],
        2023 => ['single' => 81300.0, 'mfj' => 126500.0],
        2024 => ['single' => 85700.0, 'mfj' => 133300.0],
        2025 => ['single' => 88100.0, 'mfj' => 137000.0],
    ];

    private const array AMT_EXEMPTION_PHASEOUT = [
        2018 => ['single' => 500000.0, 'mfj' => 1000000.0],
        2019 => ['single' => 510300.0, 'mfj' => 1020600.0],
        2020 => ['single' => 518400.0, 'mfj' => 1036800.0],
        2021 => ['single' => 523600.0, 'mfj' => 1047200.0],
        2022 => ['single' => 539900.0, 'mfj' => 1079800.0],
        2023 => ['single' => 578150.0, 'mfj' => 1156300.0],
        2024 => ['single' => 609350.0, 'mfj' => 1218700.0],
        2025 => ['single' => 626350.0, 'mfj' => 1252700.0],
    ];

    private const array AMT_RATE_SPLIT_THRESHOLD = [
        2018 => ['single' => 191500.0, 'mfj' => 191500.0],
        2019 => ['single' => 194800.0, 'mfj' => 194800.0],
        2020 => ['single' => 197900.0, 'mfj' => 197900.0],
        2021 => ['single' => 199900.0, 'mfj' => 199900.0],
        2022 => ['single' => 206100.0, 'mfj' => 206100.0],
        2023 => ['single' => 220700.0, 'mfj' => 220700.0],
        2024 => ['single' => 232600.0, 'mfj' => 232600.0],
        2025 => ['single' => 239100.0, 'mfj' => 239100.0],
    ];

    private const array FEDERAL_BRACKETS = [
        2024 => [
            'single' => [[11600.0, 0.10], [47150.0, 0.12], [100525.0, 0.22], [191950.0, 0.24], [243725.0, 0.32], [609350.0, 0.35], [INF, 0.37]],
            'mfj' => [[23200.0, 0.10], [94300.0, 0.12], [201050.0, 0.22], [383900.0, 0.24], [487450.0, 0.32], [731200.0, 0.35], [INF, 0.37]],
        ],
        2025 => [
            'single' => [[11925.0, 0.10], [48475.0, 0.12], [103350.0, 0.22], [197300.0, 0.24], [250525.0, 0.32], [626350.0, 0.35], [INF, 0.37]],
            'mfj' => [[23850.0, 0.10], [96950.0, 0.12], [206700.0, 0.22], [394600.0, 0.24], [501050.0, 0.32], [751600.0, 0.35], [INF, 0.37]],
        ],
    ];

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     */
    public function build(array $k1Docs, ScheduleAFacts $scheduleA, float $taxableIncome, float $regularForeignTaxCredit, int $year, bool $isMarried): Form6251Facts
    {
        $sourceEntries = [];
        $manualReviewReasons = [];
        $line2dDepletion = 0.0;
        $line2kDispositionOfProperty = 0.0;
        $line2lPost1986Depreciation = 0.0;
        $line2mPassiveActivities = 0.0;
        $line2nLossLimitations = 0.0;
        $line2tIntangibleDrillingCosts = 0.0;
        $line3OtherAdjustments = 0.0;

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $label = $this->k1PartnerName($doc, $data);
            foreach (($data['codes']['17'] ?? []) as $item) {
                if (! is_array($item)) {
                    continue;
                }

                $code = strtoupper(trim((string) ($item['code'] ?? '')));
                $rawAmount = $this->parseMoney($item['value'] ?? null) ?? 0.0;
                if ($code === '' || $rawAmount === 0.0) {
                    continue;
                }

                if ($code === 'A') {
                    $line2lPost1986Depreciation = $this->sumMoney([$line2lPost1986Depreciation, $rawAmount]);
                    $sourceEntries[] = new Form6251SourceEntryFact($label, $code, '2l', $rawAmount, 'Post-1986 depreciation adjustment');
                } elseif ($code === 'B') {
                    $line2kDispositionOfProperty = $this->sumMoney([$line2kDispositionOfProperty, $rawAmount]);
                    $sourceEntries[] = new Form6251SourceEntryFact($label, $code, '2k', $rawAmount, 'Adjusted gain or loss');
                } elseif ($code === 'C') {
                    $line2dDepletion = $this->sumMoney([$line2dDepletion, $rawAmount]);
                    $sourceEntries[] = new Form6251SourceEntryFact($label, $code, '2d', $rawAmount, 'Depletion (other than oil & gas)');
                } elseif ($code === 'D') {
                    $line2tIntangibleDrillingCosts = $this->sumMoney([$line2tIntangibleDrillingCosts, $rawAmount]);
                    $sourceEntries[] = new Form6251SourceEntryFact($label, $code, '2t', $rawAmount, 'Oil, gas, and geothermal gross income', true);
                    $manualReviewReasons['de'] = 'Box 17 codes D/E require the attached statement to confirm the net Form 6251 line 2t amount.';
                } elseif ($code === 'E') {
                    $amount = $rawAmount > 0.0 ? -$rawAmount : $rawAmount;
                    $line2tIntangibleDrillingCosts = $this->sumMoney([$line2tIntangibleDrillingCosts, $amount]);
                    $sourceEntries[] = new Form6251SourceEntryFact($label, $code, '2t', $amount, 'Oil, gas, and geothermal deductions', true);
                    $manualReviewReasons['de'] = 'Box 17 codes D/E require the attached statement to confirm the net Form 6251 line 2t amount.';
                } elseif (in_array($code, ['F', 'G'], true)) {
                    $line3OtherAdjustments = $this->sumMoney([$line3OtherAdjustments, $rawAmount]);
                    $sourceEntries[] = new Form6251SourceEntryFact($label, $code, '3', $rawAmount, $code === 'F' ? 'Other AMT items' : 'Legacy other AMT item', true);
                    $manualReviewReasons[$code] = $code === 'F'
                        ? 'Box 17 code F may require a partnership statement to place the amount on the exact AMT line.'
                        : 'Legacy Box 17 code G was preserved for backward compatibility and should be reviewed against the attached statement.';
                } elseif ($code === 'H') {
                    $line2mPassiveActivities = $this->sumMoney([$line2mPassiveActivities, $rawAmount]);
                    $sourceEntries[] = new Form6251SourceEntryFact($label, $code, '2m', $rawAmount, 'Legacy passive activity loss adjustment', true);
                    $manualReviewReasons['H'] = 'Legacy Box 17 code H was preserved for backward compatibility and should be reviewed against the attached statement.';
                } else {
                    $line3OtherAdjustments = $this->sumMoney([$line3OtherAdjustments, $rawAmount]);
                    $sourceEntries[] = new Form6251SourceEntryFact($label, $code, '3', $rawAmount, 'Unmapped AMT item', true);
                    $manualReviewReasons[$code] = "Box 17 code {$code} is not explicitly mapped and should be reviewed manually.";
                }
            }
        }

        $line2a = $this->line2aTaxesOrStandardDeduction($scheduleA, $isMarried);
        $adjustmentTotal = $this->sumMoney([
            $line2a['amount'],
            $line2dDepletion,
            $line2kDispositionOfProperty,
            $line2lPost1986Depreciation,
            $line2mPassiveActivities,
            $line2nLossLimitations,
            $line2tIntangibleDrillingCosts,
            $line3OtherAdjustments,
        ]);
        $amti = $this->sumMoney([$taxableIncome, $adjustmentTotal]);
        $exemptionBase = $this->amtTableValue(self::AMT_EXEMPTION, $year, $isMarried);
        $exemptionPhaseoutThreshold = $this->amtTableValue(self::AMT_EXEMPTION_PHASEOUT, $year, $isMarried);
        $exemptionReduction = max(0.0, MoneyMath::round(($amti - $exemptionPhaseoutThreshold) * 0.25));
        $exemption = max(0.0, $this->subtractMoney($exemptionBase, $exemptionReduction));
        $amtTaxBase = max(0.0, $this->subtractMoney($amti, $exemption));
        $amtRateSplitThreshold = $this->amtTableValue(self::AMT_RATE_SPLIT_THRESHOLD, $year, $isMarried);
        $amtBeforeForeignCredit = $amtTaxBase <= $amtRateSplitThreshold
            ? MoneyMath::round($amtTaxBase * 0.26)
            : $this->sumMoney([$amtRateSplitThreshold * 0.26, ($amtTaxBase - $amtRateSplitThreshold) * 0.28]);
        $line8AmtForeignTaxCredit = min(max(0.0, $regularForeignTaxCredit), $amtBeforeForeignCredit);
        $tentativeMinTax = max(0.0, $this->subtractMoney($amtBeforeForeignCredit, $line8AmtForeignTaxCredit));
        $regularTax = $this->federalTax($taxableIncome, $year, $isMarried);
        $regularTaxAfterCredits = max(0.0, $this->subtractMoney($regularTax, max(0.0, $regularForeignTaxCredit)));
        $amt = max(0.0, $this->subtractMoney($tentativeMinTax, $regularTaxAfterCredits));

        return new Form6251Facts(
            line1TaxableIncome: $taxableIncome,
            line2aTaxesOrStandardDeduction: $line2a['amount'],
            line2aSource: $line2a['source'],
            line2cInvestmentInterest: 0.0,
            line2dDepletion: $line2dDepletion,
            line2kDispositionOfProperty: $line2kDispositionOfProperty,
            line2lPost1986Depreciation: $line2lPost1986Depreciation,
            line2mPassiveActivities: $line2mPassiveActivities,
            line2nLossLimitations: $line2nLossLimitations,
            line2tIntangibleDrillingCosts: $line2tIntangibleDrillingCosts,
            line3OtherAdjustments: $line3OtherAdjustments,
            adjustmentTotal: $adjustmentTotal,
            amti: $amti,
            exemption: $exemption,
            exemptionBase: $exemptionBase,
            exemptionReduction: $exemptionReduction,
            exemptionPhaseoutThreshold: $exemptionPhaseoutThreshold,
            amtTaxBase: $amtTaxBase,
            amtRateSplitThreshold: $amtRateSplitThreshold,
            amtBeforeForeignCredit: $amtBeforeForeignCredit,
            line8AmtForeignTaxCredit: $line8AmtForeignTaxCredit,
            tentativeMinTax: $tentativeMinTax,
            regularTax: $regularTax,
            regularForeignTaxCredit: $regularForeignTaxCredit,
            regularTaxAfterCredits: $regularTaxAfterCredits,
            amt: $amt,
            filingStatus: $isMarried ? 'mfj' : 'single',
            sourceEntries: $sourceEntries,
            requiresStatementReview: $manualReviewReasons !== [],
            manualReviewReasons: array_values($manualReviewReasons),
        );
    }

    /**
     * @return array{amount:float,source:string}
     */
    private function line2aTaxesOrStandardDeduction(ScheduleAFacts $scheduleA, bool $isMarried): array
    {
        $shouldItemize = $isMarried ? $scheduleA->shouldItemizeMarriedFilingJointly : $scheduleA->shouldItemizeSingle;
        if ($shouldItemize) {
            return ['amount' => $scheduleA->saltDeduction, 'source' => 'salt_deduction'];
        }

        return [
            'amount' => $isMarried ? $scheduleA->standardDeductionMarriedFilingJointly : $scheduleA->standardDeductionSingle,
            'source' => 'standard_deduction',
        ];
    }

    /**
     * @param  array<int, array{single: float, mfj: float}>  $table
     */
    private function amtTableValue(array $table, int $year, bool $isMarried): float
    {
        $row = $table[$year] ?? $table[self::DEFAULT_AMT_YEAR];

        return $isMarried ? $row['mfj'] : $row['single'];
    }

    private function federalTax(float $taxableIncome, int $year, bool $isMarried): float
    {
        $brackets = self::FEDERAL_BRACKETS[$year] ?? self::FEDERAL_BRACKETS[self::DEFAULT_AMT_YEAR];
        $rows = $brackets[$isMarried ? 'mfj' : 'single'];
        $tax = 0.0;
        $previousTop = 0.0;

        foreach ($rows as [$top, $rate]) {
            if ($taxableIncome <= $previousTop) {
                break;
            }

            $taxableAtRate = min($taxableIncome, $top) - $previousTop;
            $tax = $this->sumMoney([$tax, $taxableAtRate * $rate]);
            $previousTop = $top;
        }

        return $tax;
    }
}
