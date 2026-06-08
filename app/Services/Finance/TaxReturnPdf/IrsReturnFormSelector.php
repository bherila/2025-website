<?php

namespace App\Services\Finance\TaxReturnPdf;

class IrsReturnFormSelector
{
    private const float DIRECT_SCHEDULE_3_FOREIGN_TAX_LIMIT = 300.0;

    private const float DIRECT_SCHEDULE_3_FOREIGN_TAX_MFJ_LIMIT = 600.0;

    private const array DIRECT_SCHEDULE_3_FOREIGN_TAX_SOURCE_TYPES = [
        '1099_div_foreign_tax',
        '1099_int_foreign_tax',
        'k1_foreign_tax',
    ];

    /**
     * @param  array<string, mixed>  $facts
     * @return array<int, string>
     */
    public function requiredForms(array $facts): array
    {
        return array_values(array_unique(array_merge(['form-1040'], $this->supportedRequiredForms($facts), $this->unsupportedRequiredForms($facts))));
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array<int, string>
     */
    public function supportedRequiredForms(array $facts): array
    {
        $form1040 = $this->arrayValue($facts, 'form1040');
        $supported = [];
        $requiresForm8949 = $this->requiresForm8949($facts);

        if ($this->nonZero($form1040['line8'] ?? 0) || $this->nonZero($form1040['line10'] ?? 0)) {
            $supported[] = 'schedule-1';
        }

        if ($this->nonZero($form1040['line17'] ?? 0) || $this->nonZero($form1040['line20'] ?? 0) || $this->nonZero($form1040['line31'] ?? 0)) {
            $supported[] = 'schedule-3';
        }

        if ($this->nonZero($form1040['line7'] ?? 0) || $requiresForm8949) {
            $supported[] = 'schedule-d';
        }

        if ($requiresForm8949) {
            $supported[] = 'form-8949';
        }

        return array_values(array_unique($supported));
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array<int, string>
     */
    public function unsupportedRequiredForms(array $facts): array
    {
        $unsupported = [];

        if ($this->requiresScheduleB($facts)) {
            $unsupported[] = 'schedule-b';
        }

        if ($this->nonZeroValue($facts, 'scheduleC.netProfitRoutedToSchedule1')) {
            $unsupported[] = 'schedule-c';
        }

        if ($this->nonZeroValue($facts, 'form8829.line36AllowableHomeOfficeDeductionTotal')) {
            $unsupported[] = 'form-8829';
        }

        if ($this->nonZeroValue($facts, 'scheduleE.grandTotal')) {
            $unsupported[] = 'schedule-e';
        }

        if ($this->truthyValue($facts, 'scheduleF.hasActivity') || $this->nonZeroValue($facts, 'scheduleF.netFarmProfit')) {
            $unsupported[] = 'schedule-f';
        }

        if ($this->nonZeroValue($facts, 'scheduleSE.seTax') || $this->nonZeroValue($facts, 'scheduleSE.deductibleSeTax')) {
            $unsupported[] = 'schedule-se';
        }

        if ($this->requiresForm1116($facts)) {
            $unsupported[] = 'form-1116';
        }

        if ($this->truthyValue($facts, 'form4797.hasActivity')) {
            $unsupported[] = 'form-4797';
        }

        if ($this->nonZeroValue($facts, 'form4952.deductibleInvestmentInterestExpense') || $this->nonZeroValue($facts, 'form4952.disallowedCarryforward')) {
            $unsupported[] = 'form-4952';
        }

        if ($this->nonZeroValue($facts, 'form6251.amt')) {
            $unsupported[] = 'form-6251';
        }

        if ($this->nonZeroValue($facts, 'form6781.netGain')) {
            $unsupported[] = 'form-6781';
        }

        if ($this->truthyValue($facts, 'form8582.isLossLimited') || $this->nonZeroValue($facts, 'form8582.netDeductionToReturn')) {
            $unsupported[] = 'form-8582';
        }

        if ($this->truthyValue($facts, 'form8606.hasActivity')) {
            $unsupported[] = 'form-8606';
        }

        if ($this->nonZeroValue($facts, 'form8959.additionalTax') || $this->nonZeroValue($facts, 'form8959.additionalMedicareWithholding')) {
            $unsupported[] = 'form-8959';
        }

        if ($this->nonZeroValue($facts, 'form8960.niitTaxSingle') || $this->nonZeroValue($facts, 'form8960.niitTaxMarriedFilingJointly')) {
            $unsupported[] = 'form-8960';
        }

        if ($this->nonZeroValue($facts, 'form8995.deduction')) {
            $unsupported[] = 'form-8995';
        }

        return array_values(array_unique($unsupported));
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function requiresForm8949(array $facts): bool
    {
        if ($this->nonZeroValue($facts, 'form8949.rowCount')) {
            return true;
        }

        $scheduleD = $this->arrayValue($facts, 'scheduleD');

        foreach (['line1bGainLoss', 'line2GainLoss', 'line3GainLoss', 'line8bGainLoss', 'line9GainLoss', 'line10GainLoss'] as $key) {
            if ($this->nonZero($scheduleD[$key] ?? 0)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function requiresScheduleB(array $facts): bool
    {
        $scheduleB = $this->arrayValue($facts, 'scheduleB');

        return $this->numeric($scheduleB['interestTotal'] ?? 0.0) > 1500.0
            || $this->numeric($scheduleB['ordinaryDividendTotal'] ?? 0.0) > 1500.0;
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function requiresForm1116(array $facts): bool
    {
        if (! $this->nonZeroValue($facts, 'form1116.totalForeignTaxes') && ! $this->nonZeroValue($facts, 'form1116.creditValue')) {
            return false;
        }

        return ! $this->qualifiesForDirectSchedule3ForeignTaxCredit($facts);
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function qualifiesForDirectSchedule3ForeignTaxCredit(array $facts): bool
    {
        $form1116 = $this->arrayValue($facts, 'form1116');
        $totalForeignTaxes = $this->numeric($form1116['totalForeignTaxes'] ?? 0.0);

        if ($totalForeignTaxes <= 0.004 || $totalForeignTaxes > $this->directSchedule3ForeignTaxLimit($facts)) {
            return false;
        }

        if ($this->nonZero($form1116['creditValue'] ?? 0.0) && abs($this->numeric($form1116['creditValue'] ?? 0.0) - $totalForeignTaxes) > 0.004) {
            return false;
        }

        if ($this->nonZero($form1116['totalGeneralIncome'] ?? 0.0)
            || $this->nonZero($form1116['totalLine4b'] ?? 0.0)
            || $this->nonZero($form1116['totalSourcedByPartnerIncome'] ?? 0.0)
            || $this->truthyValue($facts, 'form1116.hasUserOverride')) {
            return false;
        }

        $sources = is_array($form1116['foreignTaxSources'] ?? null) ? $form1116['foreignTaxSources'] : [];
        if ($sources === []) {
            return false;
        }

        foreach ($sources as $source) {
            if (! is_array($source) || ! in_array($source['sourceType'] ?? null, self::DIRECT_SCHEDULE_3_FOREIGN_TAX_SOURCE_TYPES, true)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function directSchedule3ForeignTaxLimit(array $facts): float
    {
        $filingStatus = $this->value($facts, 'form1040.filingStatus');

        return in_array($filingStatus, ['mfj', 'married_filing_jointly'], true)
            ? self::DIRECT_SCHEDULE_3_FOREIGN_TAX_MFJ_LIMIT
            : self::DIRECT_SCHEDULE_3_FOREIGN_TAX_LIMIT;
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array<string, mixed>
     */
    private function arrayValue(array $facts, string $path): array
    {
        $value = $this->value($facts, $path);

        return is_array($value) ? $value : [];
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function nonZeroValue(array $facts, string $path): bool
    {
        return $this->nonZero($this->value($facts, $path));
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function truthyValue(array $facts, string $path): bool
    {
        $value = $this->value($facts, $path);

        if (is_bool($value)) {
            return $value;
        }

        if (! is_scalar($value)) {
            return false;
        }

        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function value(array $facts, string $path): mixed
    {
        $current = $facts;

        foreach (explode('.', $path) as $segment) {
            if (! is_array($current) || ! array_key_exists($segment, $current)) {
                return null;
            }

            $current = $current[$segment];
        }

        return $current;
    }

    private function nonZero(mixed $value): bool
    {
        return is_numeric($value) && abs((float) $value) > 0.004;
    }

    private function numeric(mixed $value): float
    {
        return is_numeric($value) ? (float) $value : 0.0;
    }
}
