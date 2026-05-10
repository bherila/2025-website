<?php

namespace App\Services\Finance\CapitalGains;

class BrokerWashSaleTreatmentNormalizer
{
    public const TREATMENT_GROSS_OF_WASH_SALES = 'gross_of_wash_sales';

    public const TREATMENT_ALREADY_REFLECTED_IN_COST_BASIS = 'already_reflected_in_cost_basis';

    public const TREATMENT_ALREADY_NET_OF_WASH_SALES = 'already_net_of_wash_sales';

    public const TREATMENT_NO_WASH_SALE_AMOUNT = 'no_wash_sale_amount';

    public const TREATMENT_UNKNOWN = 'unknown';

    private const MONEY_TOLERANCE = 0.02;

    /**
     * @return array{realized_gain_loss: float, wash_sale_disallowed: float, wash_sale_treatment: string, note: string|null}
     */
    public function normalizeAmounts(
        float $proceeds,
        float $costBasis,
        ?float $reportedGainLoss,
        float $washSaleDisallowed,
        mixed $treatment,
    ): array {
        $notes = [];
        $reportedWashSaleDisallowed = round($washSaleDisallowed, 4);
        $washSaleDisallowed = round(abs($washSaleDisallowed), 4);

        if ($reportedWashSaleDisallowed < 0) {
            $notes[] = 'Broker wash-sale disallowed amount was negative; stored the positive Form 8949 adjustment amount.';
        }

        $grossGainLoss = round($proceeds - $costBasis, 4);
        $netGainLoss = round($grossGainLoss + $washSaleDisallowed, 4);
        $reportedGainLoss = $reportedGainLoss !== null ? round($reportedGainLoss, 4) : null;
        $normalizedTreatment = $this->normalizeTreatment($treatment);

        if ($washSaleDisallowed <= self::MONEY_TOLERANCE) {
            return [
                'realized_gain_loss' => $reportedGainLoss ?? $grossGainLoss,
                'wash_sale_disallowed' => 0.0,
                'wash_sale_treatment' => self::TREATMENT_NO_WASH_SALE_AMOUNT,
                'note' => $this->note($notes),
            ];
        }

        if ($normalizedTreatment === self::TREATMENT_ALREADY_REFLECTED_IN_COST_BASIS) {
            $notes[] = 'Broker reports wash-sale loss as already reflected in cost basis or realized gain/loss; stored W adjustment as 0 to avoid double-counting.';

            return [
                'realized_gain_loss' => $reportedGainLoss ?? $grossGainLoss,
                'wash_sale_disallowed' => 0.0,
                'wash_sale_treatment' => $normalizedTreatment,
                'note' => $this->note($notes),
            ];
        }

        if ($normalizedTreatment === self::TREATMENT_GROSS_OF_WASH_SALES) {
            if ($reportedGainLoss !== null && ! $this->moneyClose($reportedGainLoss, $grossGainLoss)) {
                $notes[] = 'Broker was marked gross of wash sales, but reported gain/loss did not equal proceeds minus basis; Form 8949 amount was normalized from proceeds, basis, and wash sale.';
            }

            return [
                'realized_gain_loss' => $netGainLoss,
                'wash_sale_disallowed' => $washSaleDisallowed,
                'wash_sale_treatment' => $normalizedTreatment,
                'note' => $this->note($notes),
            ];
        }

        if ($normalizedTreatment === self::TREATMENT_ALREADY_NET_OF_WASH_SALES) {
            if ($reportedGainLoss !== null && ! $this->moneyClose($reportedGainLoss, $netGainLoss)) {
                $notes[] = 'Broker was marked net of wash sales, but reported gain/loss did not equal proceeds minus basis plus wash sale; Form 8949 amount was normalized from proceeds, basis, and wash sale.';
            }

            return [
                'realized_gain_loss' => $this->moneyClose($reportedGainLoss, $netGainLoss) ? (float) $reportedGainLoss : $netGainLoss,
                'wash_sale_disallowed' => $washSaleDisallowed,
                'wash_sale_treatment' => $normalizedTreatment,
                'note' => $this->note($notes),
            ];
        }

        if ($reportedGainLoss !== null && $this->moneyClose($reportedGainLoss, $netGainLoss)) {
            return [
                'realized_gain_loss' => (float) $reportedGainLoss,
                'wash_sale_disallowed' => $washSaleDisallowed,
                'wash_sale_treatment' => self::TREATMENT_ALREADY_NET_OF_WASH_SALES,
                'note' => $this->note($notes),
            ];
        }

        if ($reportedGainLoss !== null && $this->moneyClose($reportedGainLoss, $grossGainLoss)) {
            $notes[] = 'Broker gain/loss appears gross of wash sales; normalized realized gain/loss adds the wash-sale adjustment once.';

            return [
                'realized_gain_loss' => $netGainLoss,
                'wash_sale_disallowed' => $washSaleDisallowed,
                'wash_sale_treatment' => self::TREATMENT_GROSS_OF_WASH_SALES,
                'note' => $this->note($notes),
            ];
        }

        $notes[] = 'Broker wash-sale treatment was not identified; Form 8949 amount was computed as proceeds minus basis plus wash-sale disallowed.';

        return [
            'realized_gain_loss' => $netGainLoss,
            'wash_sale_disallowed' => $washSaleDisallowed,
            'wash_sale_treatment' => self::TREATMENT_UNKNOWN,
            'note' => $this->note($notes),
        ];
    }

    public function normalizeTreatment(mixed $value): string
    {
        if (! is_string($value)) {
            return self::TREATMENT_UNKNOWN;
        }

        $normalized = strtolower(trim($value));
        $normalized = preg_replace('/[^a-z0-9]+/', '_', $normalized) ?? $normalized;
        $normalized = trim($normalized, '_');

        return match ($normalized) {
            'gross',
            'gross_of_wash_sale',
            'gross_of_wash_sales',
            'reported_gain_loss_gross',
            'reported_gain_loss_gross_of_wash_sales',
            'separate_w_adjustment',
            'wash_sale_separate_adjustment' => self::TREATMENT_GROSS_OF_WASH_SALES,

            'already_reflected_in_cost_basis',
            'basis_adjusted',
            'cost_basis_adjusted',
            'cost_basis_includes_wash_sale',
            'included_in_basis',
            'included_in_cost_basis',
            'wash_in_basis',
            'wash_sale_in_basis',
            'wash_sale_included_in_basis' => self::TREATMENT_ALREADY_REFLECTED_IN_COST_BASIS,

            'already_net',
            'already_net_of_wash_sale',
            'already_net_of_wash_sales',
            'included_in_gain_loss',
            'net',
            'net_of_wash_sale',
            'net_of_wash_sales',
            'realized_gain_loss_includes_wash_sale',
            'wash_sale_included_in_gain_loss' => self::TREATMENT_ALREADY_NET_OF_WASH_SALES,

            'n_a',
            'na',
            'none',
            'no_wash_sale',
            'no_wash_sale_amount',
            'no_wash_sales',
            'not_applicable' => self::TREATMENT_NO_WASH_SALE_AMOUNT,

            self::TREATMENT_UNKNOWN => self::TREATMENT_UNKNOWN,
            default => self::TREATMENT_UNKNOWN,
        };
    }

    public function storesForm8949Adjustment(mixed $treatment): bool
    {
        return in_array($this->normalizeTreatment($treatment), [
            self::TREATMENT_GROSS_OF_WASH_SALES,
            self::TREATMENT_ALREADY_NET_OF_WASH_SALES,
        ], true);
    }

    private function moneyClose(?float $actual, float $expected): bool
    {
        if ($actual === null) {
            return false;
        }

        return abs($actual - $expected) <= self::MONEY_TOLERANCE;
    }

    /**
     * Trim, drop empty/null, and join reconciliation notes with single spaces.
     */
    public static function appendReconciliationNotes(?string ...$notes): ?string
    {
        $filtered = array_values(array_filter(array_map(
            static fn (?string $note): string => trim((string) $note),
            $notes,
        )));

        return $filtered === [] ? null : implode(' ', $filtered);
    }

    /**
     * @param  string[]  $notes
     */
    private function note(array $notes): ?string
    {
        return self::appendReconciliationNotes(...$notes);
    }
}
