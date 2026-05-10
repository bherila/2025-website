<?php

namespace App\Services\Finance\CapitalGains;

class WashSaleAdjustmentSynthesizer
{
    public const FORM_8949_BOXES = ['A', 'B', 'C', 'D', 'E', 'F'];

    public const SHORT_TERM_FORM_8949_BOXES = ['A', 'B', 'C'];

    public const LONG_TERM_FORM_8949_BOXES = ['D', 'E', 'F'];

    public const COVERED_FORM_8949_BOXES = ['A', 'D'];

    public const NONCOVERED_FORM_8949_BOXES = ['B', 'E'];

    private const MONEY_TOLERANCE = 0.02;

    private const SYNTHETIC_WASH_SALE_SYMBOL = 'WASHSALEADJ';

    public function __construct(
        private readonly BrokerWashSaleTreatmentNormalizer $washSaleTreatmentNormalizer,
    ) {}

    /**
     * @param  array<string, mixed>  $parsedData
     */
    public function washSaleTreatmentFromParsedData(array $parsedData): ?string
    {
        $candidates = [
            $parsedData['wash_sale_treatment'] ?? null,
            $parsedData['wash_sale_basis_treatment'] ?? null,
            $parsedData['extraction_notes']['wash_sale_treatment'] ?? null,
        ];

        foreach ($candidates as $candidate) {
            $treatment = $this->washSaleTreatmentNormalizer->normalizeTreatment($candidate);
            if ($treatment !== BrokerWashSaleTreatmentNormalizer::TREATMENT_UNKNOWN) {
                return $treatment;
            }
        }

        return null;
    }

    /**
     * @param  array<int, mixed>  $transactions
     * @param  array<string, mixed>  $parsedData
     * @return array<int, mixed>
     */
    public function appendSummaryWashSaleAdjustmentTransactions(array $transactions, array $parsedData, mixed $defaultWashSaleTreatment): array
    {
        return array_merge(
            $transactions,
            $this->summaryWashSaleAdjustmentTransactions($transactions, $parsedData, $defaultWashSaleTreatment),
        );
    }

    /**
     * @param  array<int, mixed>  $transactions
     * @param  array<string, mixed>  $parsedData
     * @return array<int, array<string, mixed>>
     */
    public function summaryWashSaleAdjustmentTransactions(array $transactions, array $parsedData, mixed $defaultWashSaleTreatment): array
    {
        $normalizedDefault = $this->washSaleTreatmentNormalizer->normalizeTreatment($defaultWashSaleTreatment);

        if (in_array($normalizedDefault, [
            BrokerWashSaleTreatmentNormalizer::TREATMENT_ALREADY_REFLECTED_IN_COST_BASIS,
            BrokerWashSaleTreatmentNormalizer::TREATMENT_NO_WASH_SALE_AMOUNT,
        ], true)) {
            return [];
        }

        $normalizedTreatment = $this->washSaleTreatmentNormalizer->storesForm8949Adjustment($normalizedDefault)
            ? $normalizedDefault
            : $this->inferAdjustmentTreatmentFromTransactions($transactions);
        if ($normalizedTreatment === null) {
            return [];
        }

        $sectionsByBox = $this->summarySectionsByForm8949Box($parsedData);
        if ($sectionsByBox === []) {
            return [];
        }

        $washSaleByBox = $this->transactionWashSaleByForm8949Box($transactions);
        $syntheticTransactions = [];

        foreach ($sectionsByBox as $box => $section) {
            $summaryWashSale = $this->numericFromFirstKey($section, ['total_wash_sales', 'total_wash_sale_disallowed']);
            if ($summaryWashSale === null || $summaryWashSale <= self::MONEY_TOLERANCE) {
                continue;
            }

            $delta = round($summaryWashSale - ($washSaleByBox[$box] ?? 0.0), 4);
            if ($delta <= self::MONEY_TOLERANCE) {
                continue;
            }

            $saleDate = $this->lastTransactionSaleDateForBox($transactions, $box);
            if ($saleDate === null) {
                continue;
            }

            $syntheticTransactions[] = [
                'symbol' => self::SYNTHETIC_WASH_SALE_SYMBOL,
                'description' => "Broker summary wash-sale adjustment (Form 8949 Box {$box})",
                'cusip' => null,
                'quantity' => 1,
                'purchase_date' => 'various',
                'sale_date' => $saleDate,
                'proceeds' => 0.0,
                'cost_basis' => 0.0,
                'accrued_market_discount' => null,
                'wash_sale_disallowed' => $delta,
                'realized_gain_loss' => $normalizedTreatment === BrokerWashSaleTreatmentNormalizer::TREATMENT_ALREADY_NET_OF_WASH_SALES ? $delta : 0.0,
                'is_short_term' => in_array($box, self::SHORT_TERM_FORM_8949_BOXES, true),
                'form_8949_box' => $box,
                'is_covered' => in_array($box, self::COVERED_FORM_8949_BOXES, true) ? true : (in_array($box, self::NONCOVERED_FORM_8949_BOXES, true) ? false : null),
                'wash_sale_treatment' => $normalizedTreatment,
                'reconciliation_notes' => 'Synthetic adjustment created because the 1099-B summary reported more wash-sale disallowed than the extracted transaction rows.',
                'skip_transaction_matching' => true,
            ];
        }

        return $syntheticTransactions;
    }

    /**
     * @param  array<string, mixed>  $parsedData
     * @return array<string, array<string, mixed>>
     */
    public function summarySectionsByForm8949Box(array $parsedData): array
    {
        $sections = $parsedData['summary']['sections'] ?? [];
        if (! is_array($sections)) {
            return [];
        }

        $byBox = [];
        foreach ($sections as $section) {
            if (! is_array($section)) {
                continue;
            }

            $box = $this->form8949BoxFromSummarySection($section);
            if ($box !== null) {
                $byBox[$box] = $section;
            }
        }

        return $byBox;
    }

    /**
     * @param  array<string, mixed>  $section
     */
    public function form8949BoxFromSummarySection(array $section): ?string
    {
        $box = $this->form8949Box($section['form_8949_box'] ?? null);
        if ($box !== null) {
            return $box;
        }

        $name = strtolower((string) ($section['name'] ?? ''));

        return match (true) {
            str_contains($name, 'box_a') || str_contains($name, 'box a') => 'A',
            str_contains($name, 'box_b') || str_contains($name, 'box b') => 'B',
            str_contains($name, 'box_c') || str_contains($name, 'box c') => 'C',
            str_contains($name, 'box_d') || str_contains($name, 'box d') => 'D',
            str_contains($name, 'box_e') || str_contains($name, 'box e') => 'E',
            str_contains($name, 'box_f') || str_contains($name, 'box f') => 'F',
            default => null,
        };
    }

    public function form8949Box(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $box = strtoupper(trim($value));

        return in_array($box, self::FORM_8949_BOXES, true) ? $box : null;
    }

    /**
     * @param  array<int, mixed>  $transactions
     */
    private function inferAdjustmentTreatmentFromTransactions(array $transactions): ?string
    {
        foreach ($transactions as $transaction) {
            if (! is_array($transaction)) {
                continue;
            }

            $treatment = $this->washSaleTreatmentNormalizer->normalizeTreatment($transaction['wash_sale_treatment'] ?? null);
            if ($this->washSaleTreatmentNormalizer->storesForm8949Adjustment($treatment)) {
                return $treatment;
            }
        }

        return null;
    }

    /**
     * @param  array<int, mixed>  $transactions
     * @return array<string, float>
     */
    private function transactionWashSaleByForm8949Box(array $transactions): array
    {
        $byBox = [];
        foreach ($transactions as $transaction) {
            if (! is_array($transaction)) {
                continue;
            }

            $box = $this->form8949Box($transaction['form_8949_box'] ?? null);
            if ($box === null) {
                continue;
            }

            $byBox[$box] = ($byBox[$box] ?? 0.0)
                + (is_numeric($transaction['wash_sale_disallowed'] ?? null) ? abs((float) $transaction['wash_sale_disallowed']) : 0.0);
        }

        return $byBox;
    }

    /**
     * @param  array<int, mixed>  $transactions
     */
    private function lastTransactionSaleDateForBox(array $transactions, string $box): ?string
    {
        $saleDates = [];
        foreach ($transactions as $transaction) {
            if (! is_array($transaction) || $this->form8949Box($transaction['form_8949_box'] ?? null) !== $box) {
                continue;
            }

            $saleDate = $this->normalizeDateOrNull($transaction['sale_date'] ?? null);
            if ($saleDate !== null) {
                $saleDates[] = $saleDate;
            }
        }

        if ($saleDates === []) {
            return null;
        }

        rsort($saleDates);

        return $saleDates[0];
    }

    private function normalizeDateOrNull(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '' || strtolower($trimmed) === 'various') {
            return null;
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed)) {
            return $trimmed;
        }

        try {
            return (new \DateTime($trimmed))->format('Y-m-d');
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  string[]  $keys
     */
    private function numericFromFirstKey(array $data, array $keys): ?float
    {
        foreach ($keys as $key) {
            if (is_numeric($data[$key] ?? null)) {
                return (float) $data[$key];
            }
        }

        return null;
    }
}
