<?php

namespace App\Services\Finance;

use App\Models\FinanceTool\FinPartnershipBasisEvent;

/**
 * Shared sale/exchange amount-realized math for partnership-basis dispositions.
 *
 * Both the stored liquidation_gain_loss_cents estimate (PartnershipBasisService) and the Form 8949
 * proceeds row (PartnershipBasisFactsBuilder) derive proceeds from the same sale_exchange event
 * metadata. They must stay byte-identical or the review estimate and the filed row diverge, so the
 * computation lives here and both call sites delegate to it.
 */
class PartnershipBasisSaleExchangeMath
{
    public static function amountRealizedCents(FinPartnershipBasisEvent $event): int
    {
        $metadata = $event->getAttribute('metadata');
        $metadata = is_array($metadata) ? $metadata : [];

        if (! isset($metadata['proceeds_cents']) || ! is_numeric($metadata['proceeds_cents'])) {
            return abs((int) $event->amount_cents);
        }

        return (int) $metadata['proceeds_cents']
            + self::metadataCents($metadata, 'liability_relief_cents')
            - self::metadataCents($metadata, 'selling_expenses_cents');
    }

    /** @param array<string, mixed> $metadata */
    public static function metadataCents(array $metadata, string $key): int
    {
        return isset($metadata[$key]) && is_numeric($metadata[$key]) ? (int) $metadata[$key] : 0;
    }
}
