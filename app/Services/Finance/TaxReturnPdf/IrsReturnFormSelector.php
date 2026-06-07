<?php

namespace App\Services\Finance\TaxReturnPdf;

class IrsReturnFormSelector
{
    /**
     * @param  array<string, mixed>  $facts
     * @return array<int, string>
     */
    public function requiredForms(array $facts): array
    {
        return array_values(array_unique(array_merge(['form-1040'], $this->unsupportedRequiredForms($facts))));
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array<int, string>
     */
    public function unsupportedRequiredForms(array $facts): array
    {
        $form1040 = is_array($facts['form1040'] ?? null) ? $facts['form1040'] : [];
        $unsupported = [];

        if ($this->nonZero($form1040['line8'] ?? 0) || $this->nonZero($form1040['line10'] ?? 0)) {
            $unsupported[] = 'schedule-1';
        }

        if ($this->nonZero($form1040['line17'] ?? 0) || $this->nonZero($form1040['line20'] ?? 0) || $this->nonZero($form1040['line31'] ?? 0)) {
            $unsupported[] = 'schedule-3';
        }

        if ($this->nonZero($form1040['line7'] ?? 0)) {
            $unsupported[] = 'schedule-d';
        }

        return array_values(array_unique($unsupported));
    }

    private function nonZero(mixed $value): bool
    {
        return is_numeric($value) && abs((float) $value) > 0.004;
    }
}
