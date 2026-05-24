<?php

namespace App\Services\Finance\CapitalGains;

use App\Enums\Finance\WashSaleTreatment;
use App\Models\Files\FileForTaxDocument;

/**
 * Pure compute-layer helper that applies the per-broker wash-sale convention
 * (see App\Enums\Finance\WashSaleTreatment) to a single lot's broker-reported
 * gain/loss and wash-sale disallowed amount.
 *
 * The column (g) wash-sale adjustment on Form 8949 must come from the lot's
 * `wash_sale_disallowed` regardless of treatment — only the gain/loss
 * summation differs. §1091 disallowed losses appear in column (g) once and
 * only once.
 *
 * Inputs to {@see self::adjustedForm8949GainLoss()} are the broker-reported
 * fields:
 *   - $realizedGainLoss is the broker's reported realized gain/loss for the lot
 *   - $washSaleDisallowed is the broker's reported §1091 disallowed amount,
 *     stored as a positive number (this matches Form 8949 column (g))
 */
class WashSaleTreatmentApplier
{
    /**
     * Compute the Form 8949 column (h) gain/loss for a single lot, given the
     * broker-reported amounts and the resolved wash-sale treatment.
     */
    public function adjustedForm8949GainLoss(
        float $realizedGainLoss,
        float $washSaleDisallowed,
        WashSaleTreatment $treatment,
    ): float {
        $washSaleDisallowed = abs($washSaleDisallowed);

        return match ($treatment) {
            WashSaleTreatment::GrossOfWashSales => $realizedGainLoss + $washSaleDisallowed,
            WashSaleTreatment::AlreadyReflectedInCostBasis,
            WashSaleTreatment::NetGainLossAlreadyIncludesWashSaleColumn,
            WashSaleTreatment::NoWashSaleAmount => $realizedGainLoss,
        };
    }

    /**
     * Resolve the effective {@see WashSaleTreatment} for a tax document.
     *
     * 1. If the `wash_sale_treatment` column on the document is set to a known
     *    enum value, use it (admin/override path).
     * 2. Otherwise, infer from the document's parsed_data: if the relevant
     *    1099-B summary reports total_wash_sale_disallowed > 0, default to
     *    GrossOfWashSales; otherwise NoWashSaleAmount.
     */
    public function resolveForDocument(?FileForTaxDocument $document): WashSaleTreatment
    {
        if (! $document instanceof FileForTaxDocument) {
            return WashSaleTreatment::default();
        }

        $override = WashSaleTreatment::tryFromScalar($document->wash_sale_treatment ?? null);
        if ($override instanceof WashSaleTreatment) {
            return $override;
        }

        return $this->inferFromParsedData($document) ?? WashSaleTreatment::default();
    }

    /**
     * Inspect the document's parsed_data for a 1099-B summary wash-sale total.
     *
     * Returns NULL when the document is not a 1099-B form or no signal can be
     * extracted; callers should fall back to {@see WashSaleTreatment::default()}.
     */
    private function inferFromParsedData(FileForTaxDocument $document): ?WashSaleTreatment
    {
        if ($document->form_type !== FileForTaxDocument::FORM_TYPE_1099_B
            && $document->form_type !== 'broker_1099') {
            return null;
        }

        $parsedData = $document->parsed_data;
        if (! is_array($parsedData)) {
            return null;
        }

        $total = $this->extractTotalWashSale($parsedData);
        if ($total === null) {
            return null;
        }

        return $total > 0.0
            ? WashSaleTreatment::GrossOfWashSales
            : WashSaleTreatment::NoWashSaleAmount;
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function extractTotalWashSale(array $parsedData): ?float
    {
        foreach (['total_wash_sale_disallowed', 'total_wash_sales'] as $key) {
            if (is_numeric($parsedData[$key] ?? null)) {
                return (float) $parsedData[$key];
            }
        }

        $sections = $parsedData['summary'] ?? null;
        if (! is_array($sections)) {
            return null;
        }

        $total = null;
        foreach ($sections as $section) {
            if (! is_array($section)) {
                continue;
            }

            foreach (['total_wash_sale_disallowed', 'total_wash_sales'] as $key) {
                if (is_numeric($section[$key] ?? null)) {
                    $total = ($total ?? 0.0) + (float) $section[$key];
                }
            }
        }

        return $total;
    }
}
