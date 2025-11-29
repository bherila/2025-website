<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Models\FinAccounts;
use App\Models\FinAccountLineItems;
use App\Models\FinAccountLineItemLink;

class FinanceTransactionsApiController extends Controller
{
    /**
     * Get line items (transactions) for an account
     */
    public function getLineItems(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $query = FinAccountLineItems::where('t_account', $account->acct_id)
            ->with(['tags', 'parentTransactions.account', 'childTransactions.account'])
            ->orderBy('t_date', 'desc');

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('t_date', [$request->start_date, $request->end_date]);
        }

        // Filter by year if provided
        if ($request->has('year')) {
            $year = $request->year;
            $query->whereYear('t_date', $year);
        }

        $lineItems = $query->get();

        // Transform line items to include parent_of_t_ids array
        $lineItems = $lineItems->map(function ($item) {
            $itemArray = $item->toArray();
            
            // Add parent_of_t_ids array (IDs of child transactions)
            $itemArray['parent_of_t_ids'] = $item->childTransactions->pluck('t_id')->toArray();
            
            // Add parent transaction info if exists (using the new many-to-many relationship)
            $parentTransaction = $item->parentTransactions->first();
            if ($parentTransaction) {
                $itemArray['parent_transaction'] = [
                    't_id' => $parentTransaction->t_id,
                    't_account' => $parentTransaction->t_account,
                    'acct_name' => $parentTransaction->account?->acct_name,
                    't_date' => $parentTransaction->t_date,
                    't_description' => $parentTransaction->t_description,
                    't_amt' => $parentTransaction->t_amt,
                ];
            }
            
            // Add child transactions info
            if ($item->childTransactions->count() > 0) {
                $itemArray['child_transactions'] = $item->childTransactions->map(function ($child) {
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
            
            // Remove the raw relationship data
            unset($itemArray['parent_transactions']);

            if (!$item->t_schc_category) {
                unset($itemArray['t_schc_category']);
            }
            if (empty($itemArray['parent_of_t_ids'])) {
                unset($itemArray['parent_of_t_ids']);
            }
            
            return $itemArray;
        });

        return response()->json($lineItems);
    }

    /**
     * Delete a line item (transaction)
     */
    public function deleteLineItem(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $request->validate([
            't_id' => 'required|integer',
        ]);

        FinAccountLineItems::where('t_id', $request->t_id)
            ->where('t_account', $account->acct_id)
            ->delete();

        return response()->json(['success' => true]);
    }

    /**
     * Import line items (transactions) for an account
     */
    public function importLineItems(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $lineItems = $request->json()->all();
        $dataToInsert = [];

        foreach ($lineItems as $item) {
            $dataToInsert[] = [
                't_account' => $account->acct_id,
                't_date' => $item['t_date'],
                't_date_posted' => $item['t_date_posted'] ?? null,
                't_type' => $item['t_type'] ?? null,
                't_schc_category' => $item['t_schc_category'] ?? null,
                't_amt' => $item['t_amt'] ?? null,
                't_symbol' => $item['t_symbol'] ?? null,
                't_cusip' => $item['t_cusip'] ?? null,
                't_qty' => $item['t_qty'] ?? 0,
                't_price' => $item['t_price'] ?? '0',
                't_commission' => $item['t_commission'] ?? '0',
                't_fee' => $item['t_fee'] ?? '0',
                't_method' => $item['t_method'] ?? null,
                't_source' => $item['t_source'] ?? 'import',
                't_origin' => $item['t_origin'] ?? null,
                'opt_expiration' => $item['opt_expiration'] ?? null,
                'opt_type' => $item['opt_type'] ?? null,
                'opt_strike' => $item['opt_strike'] ?? '0',
                't_description' => $item['t_description'] ?? null,
                't_comment' => $item['t_comment'] ?? null,
                't_from' => $item['t_from'] ?? null,
                't_to' => $item['t_to'] ?? null,
                't_interest_rate' => $item['t_interest_rate'] ?? null,
                't_harvested_amount' => $item['t_harvested_amount'] ?? null,
                't_account_balance' => $item['t_account_balance'] ?? null,
            ];
        }

        if (!empty($dataToInsert)) {
            FinAccountLineItems::insert($dataToInsert);
        }

        return response()->json([
            'success' => true,
            'imported' => count($dataToInsert),
        ]);
    }

    /**
     * Update a transaction with multiple fields
     */
    public function updateTransaction(Request $request, $transaction_id)
    {
        $uid = Auth::id();

        $request->validate([
            't_comment' => 'nullable|string|max:255',
            't_description' => 'nullable|string|max:255',
            't_qty' => 'nullable|numeric',
            't_price' => 'nullable|numeric',
            't_commission' => 'nullable|numeric',
            't_fee' => 'nullable|numeric',
            't_symbol' => 'nullable|string|max:20',
            't_memo' => 'nullable|string|max:1000',
        ]);

        $lineItem = FinAccountLineItems::where('t_id', $transaction_id)
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        $updateData = array_filter([
            't_comment' => $request->t_comment,
            't_description' => $request->t_description,
            't_qty' => $request->t_qty,
            't_price' => $request->t_price,
            't_commission' => $request->t_commission,
            't_fee' => $request->t_fee,
            't_symbol' => $request->t_symbol,
            't_memo' => $request->t_memo,
        ], function ($value) {
            return $value !== null;
        });

        // Allow setting values to null/0 explicitly
        if ($request->has('t_comment')) $updateData['t_comment'] = $request->t_comment;
        if ($request->has('t_description')) $updateData['t_description'] = $request->t_description;
        if ($request->has('t_qty')) $updateData['t_qty'] = $request->t_qty ?? 0;
        if ($request->has('t_price')) $updateData['t_price'] = $request->t_price ?? 0;
        if ($request->has('t_commission')) $updateData['t_commission'] = $request->t_commission ?? 0;
        if ($request->has('t_fee')) $updateData['t_fee'] = $request->t_fee ?? 0;
        if ($request->has('t_symbol')) $updateData['t_symbol'] = $request->t_symbol;
        if ($request->has('t_memo')) $updateData['t_memo'] = $request->t_memo;

        $lineItem->update($updateData);

        return response()->json(['success' => true]);
    }

    /**
     * Get available years for transactions in an account
     */
    public function getTransactionYears(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $years = FinAccountLineItems::where('t_account', $account->acct_id)
            ->selectRaw('DISTINCT YEAR(t_date) as year')
            ->orderBy('year', 'desc')
            ->pluck('year')
            ->toArray();

        return response()->json($years);
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
     */
    public function linkTransactions(Request $request)
    {
        $uid = Auth::id();

        $request->validate([
            'parent_t_id' => 'required|integer',
            'child_t_id' => 'required|integer',
        ]);

        // Verify both transactions belong to the user
        $parentTransaction = FinAccountLineItems::where('t_id', $request->parent_t_id)
            ->with('childTransactions')
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        $childTransaction = FinAccountLineItems::where('t_id', $request->child_t_id)
            ->with('parentTransactions')
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        // Check if the child is not already linked
        if ($childTransaction->parentTransactions->count() > 0) {
            return response()->json([
                'success' => false,
                'error' => 'Child transaction is already linked to another parent.',
            ], 400);
        }

        // Check if this link already exists
        $existingLink = FinAccountLineItemLink::where('parent_t_id', $request->parent_t_id)
            ->where('child_t_id', $request->child_t_id)
            ->whereNull('when_deleted')
            ->first();

        if ($existingLink) {
            return response()->json([
                'success' => false,
                'error' => 'These transactions are already linked.',
            ], 400);
        }

        // Calculate total amount of existing linked transactions
        $linkedAmount = $parentTransaction->childTransactions->sum(function ($child) {
            return abs(floatval($child->t_amt));
        });

        // Add the new child's amount
        $newLinkedAmount = $linkedAmount + abs(floatval($childTransaction->t_amt));
        $parentAmount = abs(floatval($parentTransaction->t_amt));

        // Check if linking would exceed or equal the parent amount
        if ($linkedAmount >= $parentAmount) {
            return response()->json([
                'success' => false,
                'error' => 'Cannot link more transactions. Linked amount already equals or exceeds the parent transaction amount.',
            ], 400);
        }

        // Create the link
        FinAccountLineItemLink::create([
            'parent_t_id' => $parentTransaction->t_id,
            'child_t_id' => $childTransaction->t_id,
        ]);

        return response()->json([
            'success' => true,
            'parent_t_id' => $parentTransaction->t_id,
            'child_t_id' => $childTransaction->t_id,
            'linked_amount' => $newLinkedAmount,
            'parent_amount' => $parentAmount,
        ]);
    }

    /**
     * Unlink a transaction (remove parent-child relationship from links table)
     */
    public function unlinkTransaction(Request $request, $transaction_id)
    {
        $uid = Auth::id();

        $request->validate([
            'unlink_type' => 'required|in:parent,child',
            'linked_t_id' => 'required|integer',
        ]);

        // Verify the transaction belongs to the user
        $transaction = FinAccountLineItems::where('t_id', $transaction_id)
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        if ($request->unlink_type === 'parent') {
            // We want to unlink this transaction from its parent
            // The current transaction is the child, so we delete the link where child_t_id = transaction_id
            $link = FinAccountLineItemLink::where('child_t_id', $transaction_id)
                ->where('parent_t_id', $request->linked_t_id)
                ->whereNull('when_deleted')
                ->first();

            if (!$link) {
                return response()->json([
                    'success' => false,
                    'error' => 'Transaction is not linked to the specified parent.',
                ], 400);
            }

            $link->update(['when_deleted' => now()]);
        } else {
            // We want to unlink a child from this transaction
            // The current transaction is the parent, so we delete the link where parent_t_id = transaction_id
            $link = FinAccountLineItemLink::where('parent_t_id', $transaction_id)
                ->where('child_t_id', $request->linked_t_id)
                ->whereNull('when_deleted')
                ->first();

            if (!$link) {
                return response()->json([
                    'success' => false,
                    'error' => 'Child transaction is not linked to this parent.',
                ], 400);
            }

            $link->update(['when_deleted' => now()]);
        }

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
}
