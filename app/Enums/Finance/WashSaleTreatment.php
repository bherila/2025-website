<?php

namespace App\Enums\Finance;

/**
 * Per-broker Form 8949 / Schedule D wash-sale reporting convention.
 *
 * §1091 disallowed wash-sale losses must appear in Form 8949 column (g) once and
 * only once. Brokers comply with §1091 disclosure differently — some present a
 * "gross" gain/loss with the disallowed amount as a separate column, some add
 * it to cost basis, and some net the column into the displayed gain/loss. The
 * compute layer honours each broker's convention through this enum.
 *
 * String values match the canonical convention keys in
 * tests/Fixtures/Finance/wash-sale-treatments-2025.json and the
 * fin_tax_documents.wash_sale_treatment column.
 */
enum WashSaleTreatment: string
{
    /**
     * Broker reports realized gain/loss equal to proceeds minus cost basis, with
     * the wash-sale disallowed amount shown separately. Form 8949 gain/loss must
     * equal brokerReportedGainLoss + |washSaleDisallowed|.
     */
    case GrossOfWashSales = 'gross_of_wash_sales';

    /**
     * Broker has already added the disallowed loss into the cost basis (and
     * therefore the realized gain/loss). Form 8949 gain/loss equals the
     * broker-reported gain/loss; do not re-add the wash-sale amount.
     */
    case AlreadyReflectedInCostBasis = 'already_reflected_in_cost_basis';

    /**
     * Broker's displayed net gain/loss already equals proceeds − cost basis +
     * wash sale. Form 8949 gain/loss equals the broker's displayed net gain/loss.
     */
    case NetGainLossAlreadyIncludesWashSaleColumn = 'net_gain_loss_already_includes_wash_sale_column';

    /**
     * Broker summary reports no wash-sale amount. Form 8949 gain/loss equals
     * the displayed realized gain/loss.
     */
    case NoWashSaleAmount = 'no_wash_sale_amount';

    /**
     * Default treatment when fin_tax_documents.wash_sale_treatment is NULL and
     * no document-level signal can be resolved.
     */
    public static function default(): self
    {
        return self::GrossOfWashSales;
    }

    /**
     * Resolve the treatment from a free-form scalar, falling back to NULL when
     * the input does not match a known convention key.
     */
    public static function tryFromScalar(mixed $value): ?self
    {
        if ($value instanceof self) {
            return $value;
        }

        if (! is_string($value)) {
            return null;
        }

        return self::tryFrom(trim(strtolower($value)));
    }
}
