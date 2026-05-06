<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinPayslips;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleCFacts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleSEFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class ScheduleSEFactsBuilder extends TaxPreviewFactBuilder
{
    private const float SE_EARNINGS_FACTOR = 0.9235;

    private const float SOCIAL_SECURITY_RATE = 0.124;

    private const float MEDICARE_RATE = 0.029;

    private const float ADDITIONAL_MEDICARE_RATE = 0.009;

    private const array SOCIAL_SECURITY_WAGE_BASE = [
        2018 => 128400.0,
        2019 => 132900.0,
        2020 => 137700.0,
        2021 => 142800.0,
        2022 => 147000.0,
        2023 => 160200.0,
        2024 => 168600.0,
        2025 => 176100.0,
        2026 => 183600.0,
    ];

    private const float ADDITIONAL_MEDICARE_SINGLE_THRESHOLD = 200000.0;

    private const float ADDITIONAL_MEDICARE_MFJ_THRESHOLD = 250000.0;

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $w2Docs
     */
    public function build(array $k1Docs, array $w2Docs, ScheduleCFacts $scheduleC, int $year, ?int $userId, bool $isMarried): ScheduleSEFacts
    {
        $entries = [
            ...$this->k1Entries($k1Docs),
            ...$this->scheduleCEntries($scheduleC),
        ];
        $scheduleFSources = [$this->scheduleFNeedsReviewSource()];
        $socialSecurityWageSources = $w2Docs !== []
            ? $this->w2WageSources($w2Docs, 'box3_ss_wages', 'box1_wages', TaxFactSourceType::ScheduleSEW2SocialSecurityWages, 'Social Security wages')
            : $this->payslipWageSources($userId, $year, 'taxable_wages_oasdi', TaxFactSourceType::ScheduleSEPayslipSocialSecurityWages, 'Social Security wages');
        $medicareWageSources = $w2Docs !== []
            ? $this->w2WageSources($w2Docs, 'box5_medicare_wages', 'box1_wages', TaxFactSourceType::ScheduleSEW2MedicareWages, 'Medicare wages')
            : $this->payslipWageSources($userId, $year, 'taxable_wages_medicare', TaxFactSourceType::ScheduleSEPayslipMedicareWages, 'Medicare wages');

        $netEarningsFromSE = $this->sumSources($entries);
        $seTaxableEarnings = $this->roundMoney(max(0.0, $netEarningsFromSE) * self::SE_EARNINGS_FACTOR);
        $socialSecurityWageBase = $this->socialSecurityWageBase($year);
        $socialSecurityWages = $this->sumSources($socialSecurityWageSources);
        $remainingSocialSecurityWageBase = max(0.0, $this->subtractMoney($socialSecurityWageBase, $socialSecurityWages));
        $socialSecurityTaxableEarnings = min($seTaxableEarnings, $remainingSocialSecurityWageBase);
        $socialSecurityTax = $this->roundMoney($socialSecurityTaxableEarnings * self::SOCIAL_SECURITY_RATE);
        $medicareWages = $this->sumSources($medicareWageSources);
        $medicareTaxableEarnings = $seTaxableEarnings;
        $medicareTax = $this->roundMoney($medicareTaxableEarnings * self::MEDICARE_RATE);
        $additionalMedicareThreshold = $isMarried ? self::ADDITIONAL_MEDICARE_MFJ_THRESHOLD : self::ADDITIONAL_MEDICARE_SINGLE_THRESHOLD;
        $remainingAdditionalMedicareThreshold = max(0.0, $this->subtractMoney($additionalMedicareThreshold, $medicareWages));
        $additionalMedicareTaxableEarnings = max(0.0, $this->subtractMoney($medicareTaxableEarnings, $remainingAdditionalMedicareThreshold));
        $additionalMedicareTax = $this->roundMoney($additionalMedicareTaxableEarnings * self::ADDITIONAL_MEDICARE_RATE);
        $seTax = $this->sumMoney([$socialSecurityTax, $medicareTax]);
        $deductibleSeTax = $this->roundMoney($seTax / 2);

        return new ScheduleSEFacts(
            entries: $entries,
            netEarningsFromSE: $netEarningsFromSE,
            seTaxableEarnings: $seTaxableEarnings,
            socialSecurityWageBase: $socialSecurityWageBase,
            socialSecurityWages: $socialSecurityWages,
            remainingSocialSecurityWageBase: $remainingSocialSecurityWageBase,
            socialSecurityTaxableEarnings: $socialSecurityTaxableEarnings,
            socialSecurityTax: $socialSecurityTax,
            medicareWages: $medicareWages,
            medicareTaxableEarnings: $medicareTaxableEarnings,
            medicareTax: $medicareTax,
            additionalMedicareThreshold: $additionalMedicareThreshold,
            additionalMedicareTaxableEarnings: $additionalMedicareTaxableEarnings,
            additionalMedicareTax: $additionalMedicareTax,
            seTax: $seTax,
            deductibleSeTax: $deductibleSeTax,
            wageSources: [...$socialSecurityWageSources, ...$medicareWageSources],
            scheduleFSources: $scheduleFSources,
        );
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @return TaxFactSource[]
     */
    private function k1Entries(array $k1Docs): array
    {
        $sources = [];

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            $sources = [
                ...$sources,
                ...$this->k1Box14Sources($doc, $partnerName, $data, 'A', TaxFactSourceType::ScheduleSEK1Box14A, 'net earnings from self-employment'),
                ...$this->k1Box14Sources($doc, $partnerName, $data, 'C', TaxFactSourceType::ScheduleSEK1Box14C, 'farm self-employment earnings'),
            ];
        }

        return $sources;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return TaxFactSource[]
     */
    private function k1Box14Sources(FileForTaxDocument $doc, string $partnerName, array $data, string $code, TaxFactSourceType $sourceType, string $label): array
    {
        $sources = [];

        foreach ($this->k1CodeItems($data, '14', $code) as $index => $item) {
            $amount = $this->parseMoney($item['value'] ?? null) ?? 0.0;
            if ($amount === 0.0) {
                continue;
            }

            $sources[] = new TaxFactSource(
                id: "k1-{$doc->id}-schedule-se-box-14{$code}-{$index}",
                label: "{$partnerName} — K-1 Box 14{$code} {$label}",
                amount: $amount,
                sourceType: $sourceType,
                taxDocumentId: $doc->id,
                formType: $this->formType($doc),
                box: '14',
                code: $code,
                routing: TaxFactRouting::ScheduleSELine2,
                routingReason: 'K-1 Box 14 self-employment earnings flow to Schedule SE line 2.',
                notes: is_string($item['notes'] ?? null) ? $item['notes'] : null,
                isReviewed: $this->sourceIsReviewed($doc),
                reviewStatus: $this->reviewStatus($doc),
                reviewAction: $this->reviewAction($doc),
            );
        }

        return $sources;
    }

    /**
     * @return TaxFactSource[]
     */
    private function scheduleCEntries(ScheduleCFacts $scheduleC): array
    {
        if ($scheduleC->netProfit === 0.0) {
            return [];
        }

        return [
            new TaxFactSource(
                id: 'schedule-c-schedule-se-line2',
                label: 'Schedule C net profit',
                amount: $scheduleC->netProfit,
                sourceType: TaxFactSourceType::ScheduleSEScheduleC,
                routing: TaxFactRouting::ScheduleSELine2,
                routingReason: 'Schedule SE uses the upstream Schedule C line 31 fact rather than recomputing business net profit.',
            ),
        ];
    }

    /**
     * @param  FileForTaxDocument[]  $w2Docs
     * @return TaxFactSource[]
     */
    private function w2WageSources(array $w2Docs, string $field, string $fallbackField, TaxFactSourceType $sourceType, string $label): array
    {
        $sources = [];

        foreach ($w2Docs as $doc) {
            if (! is_array($doc->parsed_data)) {
                continue;
            }

            $amount = $this->parseMoney($doc->parsed_data[$field] ?? null)
                ?? $this->parseMoney($doc->parsed_data[$fallbackField] ?? null)
                ?? 0.0;
            if ($amount === 0.0) {
                continue;
            }

            $employer = $this->w2EmployerName($doc);
            $sources[] = new TaxFactSource(
                id: "w2-{$doc->id}-schedule-se-{$field}",
                label: "{$employer} — W-2 {$label}",
                amount: $amount,
                sourceType: $sourceType,
                taxDocumentId: $doc->id,
                formType: $this->formType($doc),
                routing: TaxFactRouting::ScheduleSELine7,
                routingReason: 'W-2 wages reduce Schedule SE wage-base capacity and Additional Medicare threshold capacity.',
                isReviewed: $this->sourceIsReviewed($doc),
                reviewStatus: $this->reviewStatus($doc),
                reviewAction: $this->reviewAction($doc),
            );
        }

        return $sources;
    }

    /**
     * @return TaxFactSource[]
     */
    private function payslipWageSources(?int $userId, int $year, string $field, TaxFactSourceType $sourceType, string $label): array
    {
        if ($userId === null) {
            return [];
        }

        $amount = FinPayslips::withoutGlobalScopes()
            ->where('uid', $userId)
            ->where('pay_date', '>=', "{$year}-01-01")
            ->where('pay_date', '<=', "{$year}-12-31")
            ->get([$field])
            ->reduce(fn (float $total, FinPayslips $payslip): float => $this->sumMoney([$total, (float) $payslip->getAttribute($field)]), 0.0);

        if ($amount === 0.0) {
            return [];
        }

        return [
            new TaxFactSource(
                id: "payslips-{$year}-schedule-se-{$field}",
                label: "Payslips — {$label}",
                amount: $this->roundMoney($amount),
                sourceType: $sourceType,
                routing: TaxFactRouting::ScheduleSELine7,
                routingReason: 'Payslip taxable wages are used for Schedule SE only when no reviewed W-2 is available.',
            ),
        ];
    }

    private function scheduleFNeedsReviewSource(): TaxFactSource
    {
        return new TaxFactSource(
            id: 'schedule-f-schedule-se-needs-review',
            label: 'Schedule F net farm profit',
            amount: 0.0,
            sourceType: TaxFactSourceType::ScheduleSEScheduleF,
            routing: TaxFactRouting::ScheduleSELine4a,
            routingReason: 'Schedule F is not migrated to backend facts yet; backend Schedule SE defaults farm self-employment earnings to zero.',
            isReviewed: false,
            reviewStatus: 'needs_review',
            reviewAction: 'Review Schedule F manually if farm self-employment income applies.',
        );
    }

    private function socialSecurityWageBase(int $year): float
    {
        return self::SOCIAL_SECURITY_WAGE_BASE[$year] ?? self::SOCIAL_SECURITY_WAGE_BASE[2026];
    }

    private function w2EmployerName(FileForTaxDocument $doc): string
    {
        if (is_array($doc->parsed_data) && is_string($doc->parsed_data['employer_name'] ?? null) && trim($doc->parsed_data['employer_name']) !== '') {
            return $doc->parsed_data['employer_name'];
        }

        return $doc->original_filename ?? 'W-2';
    }
}
