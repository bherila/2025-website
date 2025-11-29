<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\FinAccounts;
use App\Models\FinAccountLineItems;
use App\Models\FinAccountLineItemLink;

class FinanceTransactionLinkingApiController extends Controller
{
    /**
     * Normalize link direction: older transaction is always 'a' (parent), newer is 'b' (child).
     * If dates are equal, lower t_id is 'a'.
     * 
     * @param FinAccountLineItems $transaction1
     * @param FinAccountLineItems $transaction2
     * @return array ['a' => FinAccountLineItems, 'b' => FinAccountLineItems]
     */
    private function normalizeLink(FinAccountLineItems $transaction1, FinAccountLineItems $transaction2): array
    {
        $date1 = strtotime($transaction1->t_date);
        $date2 = strtotime($transaction2->t_date);

        // Older date is 'a', if equal, lower t_id is 'a'
        if ($date1 < $date2 || ($date1 === $date2 && $transaction1->t_id < $transaction2->t_id)) {
            return ['a' => $transaction1, 'b' => $transaction2];
        }

        return ['a' => $transaction2, 'b' => $transaction1];
    }

    /**
     * Find an existing link between two transactions (checks both directions for safety)
     * 
     * @param int $t_id_1
     * @param int $t_id_2
     * @return FinAccountLineItemLink|null
     */
    private function findExistingLink(int $t_id_1, int $t_id_2): ?FinAccountLineItemLink
    {
        return FinAccountLineItemLink::where(function ($query) use ($t_id_1, $t_id_2) {
                $query->where('parent_t_id', $t_id_1)->where('child_t_id', $t_id_2);
            })
            ->orWhere(function ($query) use ($t_id_1, $t_id_2) {
                $query->where('parent_t_id', $t_id_2)->where('child_t_id', $t_id_1);
            })
            ->whereNull('when_deleted')
            ->first();
    }

    /**
     * Find potential transactions to link based on date and amount criteria
     */
    public function findLinkableTransactions(Request $request, $transaction_id)
    {
        $uid = Auth::id();

        // Get the source transaction
        $sourceTransaction = FinAccountLineItems::where('t_id', $transaction_id)
            ->with('childTransactions')
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        $sourceDate = $sourceTransaction->t_date;
        $sourceAmount = abs(floatval($sourceTransaction->t_amt));

        // Calculate total amount of existing linked transactions
        $linkedAmount = $sourceTransaction->childTransactions->sum(function ($child) {
            return abs(floatval($child->t_amt));
        });

        // Check if linking is allowed (linked amount must be less than source amount)
        $linkingAllowed = $linkedAmount < $sourceAmount;

        // Calculate date range (+/- 7 days)
        $startDate = date('Y-m-d', strtotime($sourceDate . ' -7 days'));
        $endDate = date('Y-m-d', strtotime($sourceDate . ' +7 days'));

        // Calculate amount range (+/- 5%)
        $minAmount = $sourceAmount * 0.95;
        $maxAmount = $sourceAmount * 1.05;

        // Find transactions across all user's accounts that match criteria
        $potentialMatches = FinAccountLineItems::whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->with('account:acct_id,acct_name')
            ->whereBetween('t_date', [$startDate, $endDate])
            ->where('t_id', '!=', $transaction_id) // Exclude the source transaction
            ->where('t_account', '!=', $sourceTransaction->t_account) // Exclude same account
            ->whereDoesntHave('parentTransactions') // Exclude already-linked child transactions
            ->whereDoesntHave('childTransactions') // Exclude transactions that are already parents
            ->where(function ($query) use ($minAmount, $maxAmount) {
                // Match on absolute amount within range
                $query->whereRaw('ABS(t_amt) BETWEEN ? AND ?', [$minAmount, $maxAmount]);
            })
            ->orderByRaw('ABS(ABS(t_amt) - ?)', [$sourceAmount]) // Order by closest amount match
            ->orderBy('t_date', 'asc')
            ->limit(50)
            ->get(['t_id', 't_account', 't_date', 't_description', 't_amt', 't_type']);

        // Add account name to each match
        $potentialMatches = $potentialMatches->map(function ($item) {
            return [
                't_id' => $item->t_id,
                't_account' => $item->t_account,
                'acct_name' => $item->account?->acct_name,
                't_date' => $item->t_date,
                't_description' => $item->t_description,
                't_amt' => $item->t_amt,
                't_type' => $item->t_type,
            ];
        });

        return response()->json([
            'source_transaction' => [
                't_id' => $sourceTransaction->t_id,
                't_account' => $sourceTransaction->t_account,
                't_date' => $sourceTransaction->t_date,
                't_description' => $sourceTransaction->t_description,
                't_amt' => $sourceTransaction->t_amt,
            ],
            'potential_matches' => $potentialMatches,
            'linked_amount' => $linkedAmount,
            'linking_allowed' => $linkingAllowed,
        ]);
    }

    /**
     * Link two transactions (set parent-child relationship via links table)
     * Links are normalized: older transaction is 'a' (parent), newer is 'b' (child).
     * If dates are equal, lower t_id is 'a'.
     */
    public function linkTransactions(Request $request)
    {
        $uid = Auth::id();

        $request->validate([
            'parent_t_id' => 'required|integer',
            'child_t_id' => 'required|integer',
        ]);

        // Verify both transactions belong to the user
        $transaction1 = FinAccountLineItems::where('t_id', $request->parent_t_id)
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        $transaction2 = FinAccountLineItems::where('t_id', $request->child_t_id)
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        // Normalize link direction: older transaction is 'a' (parent), newer is 'b' (child)
        $normalized = $this->normalizeLink($transaction1, $transaction2);
        $parentTransaction = $normalized['a'];
        $childTransaction = $normalized['b'];

        // Check if this link already exists (in either direction)
        $existingLink = $this->findExistingLink($transaction1->t_id, $transaction2->t_id);

        if ($existingLink) {
            return response()->json([
                'success' => false,
                'error' => 'These transactions are already linked.',
            ], 400);
        }

        // Create the link with normalized direction
        FinAccountLineItemLink::create([
            'parent_t_id' => $parentTransaction->t_id,
            'child_t_id' => $childTransaction->t_id,
        ]);

        return response()->json([
            'success' => true,
            'parent_t_id' => $parentTransaction->t_id,
            'child_t_id' => $childTransaction->t_id,
        ]);
    }

    /**
     * Unlink a transaction (remove link from links table)
     * With normalized links, we need to check both directions since the caller
     * might not know which transaction ended up as parent vs child.
     */
    public function unlinkTransaction(Request $request, $transaction_id)
    {
        $uid = Auth::id();

        $request->validate([
            'linked_t_id' => 'required|integer',
        ]);

        // Verify both transactions belong to the user
        $transaction = FinAccountLineItems::where('t_id', $transaction_id)
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        FinAccountLineItems::where('t_id', $request->linked_t_id)
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        // Find the link between these two transactions (in either direction)
        $link = $this->findExistingLink($transaction_id, $request->linked_t_id);

        if (!$link) {
            return response()->json([
                'success' => false,
                'error' => 'These transactions are not linked.',
            ], 400);
        }

        $link->update(['when_deleted' => now()]);

        return response()->json(['success' => true]);
    }

    /**
     * Get transaction link details for a specific transaction
     */
    public function getTransactionLinks(Request $request, $transaction_id)
    {
        $uid = Auth::id();

        $transaction = FinAccountLineItems::where('t_id', $transaction_id)
            ->with(['parentTransactions.account', 'childTransactions.account'])
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        // Calculate linked amount
        $linkedAmount = $transaction->childTransactions->sum(function ($child) {
            return abs(floatval($child->t_amt));
        });

        $parentAmount = abs(floatval($transaction->t_amt));
        $linkingAllowed = $linkedAmount < $parentAmount;

        // Get parent transaction (first one since we're transitioning from single parent)
        $parentTransaction = $transaction->parentTransactions->first();

        $result = [
            't_id' => $transaction->t_id,
            't_account' => $transaction->t_account,
            't_date' => $transaction->t_date,
            't_description' => $transaction->t_description,
            't_amt' => $transaction->t_amt,
            'parent_transaction' => null,
            'child_transactions' => [],
            'linked_amount' => $linkedAmount,
            'linking_allowed' => $linkingAllowed,
        ];

        if ($parentTransaction) {
            $result['parent_transaction'] = [
                't_id' => $parentTransaction->t_id,
                't_account' => $parentTransaction->t_account,
                'acct_name' => $parentTransaction->account?->acct_name,
                't_date' => $parentTransaction->t_date,
                't_description' => $parentTransaction->t_description,
                't_amt' => $parentTransaction->t_amt,
            ];
        }

        if ($transaction->childTransactions->count() > 0) {
            $result['child_transactions'] = $transaction->childTransactions->map(function ($child) {
                return [
                    't_id' => $child->t_id,
                    't_account' => $child->t_account,
                    'acct_name' => $child->account?->acct_name,
                    't_date' => $child->t_date,
                    't_description' => $child->t_description,
                    't_amt' => $child->t_amt,
                ];
            })->toArray();
        }

        return response()->json($result);
    }

    /**
     * Find all unlinked transactions for an account and suggest linkable pairs
     * with transactions from other accounts.
     * 
     * Uses in-memory processing for efficiency (SQL roundtrip latency > memory cost).
     * For bulk linking: requires EXACT amount match, but allows ±5 day date offset
     * to accommodate weekends and holidays.
     */
    public function findLinkablePairs(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        // Build query for unlinked transactions in this account
        $query = FinAccountLineItems::where('t_account', $account_id)
            ->whereDoesntHave('parentTransactions')
            ->whereDoesntHave('childTransactions')
            ->whereNull('when_deleted')
            ->with('account:acct_id,acct_name');

        // Filter by year if provided
        $yearFilter = null;
        if ($request->has('year') && $request->year !== 'all') {
            $yearFilter = intval($request->year);
            $query->whereYear('t_date', $yearFilter);
        }

        $unlinkedTransactions = $query->get();

        // Skip if no transactions to process
        if ($unlinkedTransactions->isEmpty()) {
            return response()->json(['pairs' => [], 'total' => 0]);
        }

        // Calculate date range for potential matches (min/max from source transactions ±5 days)
        $dates = $unlinkedTransactions->pluck('t_date')->toArray();
        $minDate = min($dates);
        $maxDate = max($dates);
        $startDate = date('Y-m-d', strtotime($minDate . ' -5 days'));
        $endDate = date('Y-m-d', strtotime($maxDate . ' +5 days'));

        // Fetch all potential matches from OTHER accounts in one query
        // This is more efficient than N queries (one per transaction)
        $potentialMatches = FinAccountLineItems::whereHas('account', function ($q) use ($uid) {
                $q->where('acct_owner', $uid);
            })
            ->where('t_account', '!=', $account_id)
            ->whereDoesntHave('parentTransactions')
            ->whereDoesntHave('childTransactions')
            ->whereNull('when_deleted')
            ->whereBetween('t_date', [$startDate, $endDate])
            ->with('account:acct_id,acct_name')
            ->get();

        // Index potential matches by absolute amount for O(1) lookup
        // Key: rounded absolute amount (to 2 decimal places)
        // Value: array of transactions with that amount
        $matchesByAmount = [];
        foreach ($potentialMatches as $match) {
            $absAmt = round(abs(floatval($match->t_amt)), 2);
            $key = (string) $absAmt;
            if (!isset($matchesByAmount[$key])) {
                $matchesByAmount[$key] = [];
            }
            $matchesByAmount[$key][] = $match;
        }

        // Find linkable pairs using in-memory matching
        $linkablePairs = [];
        $seenPairs = [];

        foreach ($unlinkedTransactions as $transaction) {
            $sourceAmount = abs(floatval($transaction->t_amt));

            // Skip zero amounts
            if ($sourceAmount == 0) {
                continue;
            }

            // Look up exact matches by amount
            $amountKey = (string) round($sourceAmount, 2);
            if (!isset($matchesByAmount[$amountKey])) {
                continue;
            }

            $sourceDate = strtotime($transaction->t_date);

            foreach ($matchesByAmount[$amountKey] as $match) {
                // Skip if same transaction (shouldn't happen, but be safe)
                if ($match->t_id === $transaction->t_id) {
                    continue;
                }

                // Check date is within ±5 days
                $matchDate = strtotime($match->t_date);
                $dateDiff = abs($sourceDate - $matchDate) / 86400; // days
                if ($dateDiff > 5) {
                    continue;
                }

                // Create unique pair key to avoid duplicates
                $pairKey = min($transaction->t_id, $match->t_id) . '-' . max($transaction->t_id, $match->t_id);
                if (isset($seenPairs[$pairKey])) {
                    continue;
                }
                $seenPairs[$pairKey] = true;

                // Check if amounts are opposite signs (indicating a transfer)
                $sourceAmt = floatval($transaction->t_amt);
                $matchAmt = floatval($match->t_amt);
                $areOppositeSigns = ($sourceAmt > 0 && $matchAmt < 0) || ($sourceAmt < 0 && $matchAmt > 0);

                $linkablePairs[] = [
                    'transaction_a' => [
                        't_id' => $transaction->t_id,
                        't_account' => $transaction->t_account,
                        'acct_name' => $transaction->account?->acct_name,
                        't_date' => $transaction->t_date,
                        't_description' => $transaction->t_description,
                        't_amt' => $transaction->t_amt,
                        't_type' => $transaction->t_type,
                    ],
                    'transaction_b' => [
                        't_id' => $match->t_id,
                        't_account' => $match->t_account,
                        'acct_name' => $match->account?->acct_name,
                        't_date' => $match->t_date,
                        't_description' => $match->t_description,
                        't_amt' => $match->t_amt,
                        't_type' => $match->t_type,
                    ],
                    'are_opposite_signs' => $areOppositeSigns,
                    'amount_diff' => 0.0, // Exact match
                    'date_diff' => $dateDiff,
                ];

                // Limit total pairs
                if (count($linkablePairs) >= 100) {
                    break 2;
                }
            }
        }

        // Sort pairs: prioritize opposite signs, then by smallest date difference
        usort($linkablePairs, function ($a, $b) {
            // Opposite signs first
            if ($a['are_opposite_signs'] !== $b['are_opposite_signs']) {
                return $a['are_opposite_signs'] ? -1 : 1;
            }
            // Then by date difference
            return $a['date_diff'] <=> $b['date_diff'];
        });

        return response()->json([
            'pairs' => $linkablePairs,
            'total' => count($linkablePairs),
        ]);
    }
}
