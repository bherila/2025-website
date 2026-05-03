<?php

namespace App\Services\Finance;

use App\Models\FinanceTool\FinAccountLineItemDeletion;
use App\Models\FinanceTool\FinAccountLineItems;
use Illuminate\Support\Collection;

class TransactionDeletionTombstoneService
{
    /**
     * @param  Collection<int, FinAccountLineItems>|iterable<FinAccountLineItems>  $transactions
     */
    public function record(iterable $transactions, int $userId): void
    {
        $now = now();
        $rows = collect($transactions)
            ->map(function (FinAccountLineItems $transaction) use ($now, $userId): array {
                return [
                    't_id' => (int) $transaction->t_id,
                    't_account' => (int) $transaction->t_account,
                    'user_id' => $userId,
                    'deleted_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            })
            ->values()
            ->all();

        if ($rows === []) {
            return;
        }

        FinAccountLineItemDeletion::upsert(
            $rows,
            ['t_id'],
            ['t_account', 'user_id', 'deleted_at', 'updated_at'],
        );
    }
}
