<?php

namespace App\Http\Controllers\UtilityBillTracker\Concerns;

use App\Models\User;
use App\Models\UtilityBillTracker\UtilityBill;
use App\Support\Access\FeatureAccess;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;

/**
 * Utility-bill endpoints are gated by `utility-bills.*`, so a user without
 * `finance.transactions.view` can reach them. The linked finance transaction
 * carries the description/amount we must not expose to those users; redact
 * those fields on the already-loaded relation while keeping the date/id needed
 * to render the link.
 */
trait RedactsLinkedTransactions
{
    /**
     * Redact linked-transaction detail on one bill (or a collection of bills)
     * for the current user when they lack `finance.transactions.view`.
     *
     * @template TBills of UtilityBill|Collection<int, UtilityBill>
     *
     * @param  TBills  $bills
     * @return TBills
     */
    protected function redactLinkedTransactions(UtilityBill|Collection $bills): UtilityBill|Collection
    {
        $user = Auth::user();
        $canReadTransactions = $user instanceof User
            && app(FeatureAccess::class)->can($user, 'finance.transactions.view');

        if ($canReadTransactions) {
            return $bills;
        }

        $collection = $bills instanceof UtilityBill ? collect([$bills]) : $bills;

        foreach ($collection as $bill) {
            $linked = $bill->linkedTransaction;

            if ($linked !== null) {
                $linked->t_description = null;
                $linked->t_amt = null;
            }
        }

        return $bills;
    }
}
