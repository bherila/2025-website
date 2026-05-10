<?php

namespace App\Services\Finance\CapitalGains;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinLotReconciliationLink;

class LotReconciliationStatusCacheVerifier
{
    /**
     * @return list<string>
     */
    public function auditDocument(int $taxDocumentId): array
    {
        $findings = [];
        $links = FinLotReconciliationLink::query()
            ->where('tax_document_id', $taxDocumentId)
            ->orderBy('id')
            ->get();
        $lotIds = [];

        foreach ($links as $link) {
            if ($link->broker_lot_id !== null) {
                $lotIds[] = (int) $link->broker_lot_id;
            }
            if ($link->account_lot_id !== null) {
                $lotIds[] = (int) $link->account_lot_id;
            }
        }

        foreach (array_values(array_unique($lotIds)) as $lotId) {
            $lot = FinAccountLot::query()->find($lotId);
            if (! $lot instanceof FinAccountLot) {
                $findings[] = "Lot {$lotId} is referenced by a reconciliation link but no longer exists.";

                continue;
            }

            $latestLink = FinLotReconciliationLink::query()
                ->where('tax_document_id', $taxDocumentId)
                ->where(function ($query) use ($lotId): void {
                    $query->where('broker_lot_id', $lotId)
                        ->orWhere('account_lot_id', $lotId);
                })
                ->latest('id')
                ->first();

            $expectedStatus = $latestLink instanceof FinLotReconciliationLink ? $latestLink->state : null;
            if ($lot->reconciliation_status !== $expectedStatus) {
                $findings[] = sprintf(
                    'Lot %d reconciliation_status cache is %s but latest link state is %s.',
                    $lotId,
                    $lot->reconciliation_status ?? 'null',
                    $expectedStatus ?? 'null',
                );
            }

            $expectedSupersededBy = null;
            if (
                $latestLink instanceof FinLotReconciliationLink
                && $latestLink->state === FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE
                && $latestLink->broker_lot_id !== null
                && (int) $latestLink->broker_lot_id === $lotId
            ) {
                $expectedSupersededBy = $latestLink->account_lot_id !== null ? (int) $latestLink->account_lot_id : null;
            }

            $actualSupersededBy = $lot->superseded_by_lot_id !== null ? (int) $lot->superseded_by_lot_id : null;
            if ($actualSupersededBy !== $expectedSupersededBy) {
                $findings[] = sprintf(
                    'Lot %d superseded_by_lot_id cache is %s but latest link expects %s.',
                    $lotId,
                    $actualSupersededBy !== null ? (string) $actualSupersededBy : 'null',
                    $expectedSupersededBy !== null ? (string) $expectedSupersededBy : 'null',
                );
            }
        }

        return $findings;
    }
}
