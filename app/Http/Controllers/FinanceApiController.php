<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Models\FinAccounts;
use App\Models\FinAccountLineItems;
use App\Models\FinAccountTag;
use App\Models\FinAccountLineItemTagMap;

class FinanceApiController extends Controller
{
    public function accounts(Request $request)
    {
        $uid = Auth::id();

        $accounts = FinAccounts::where('acct_owner', $uid)
            ->whereNull('when_deleted')
            ->orderBy('when_closed', 'asc')
            ->orderBy('acct_sort_order', 'asc')
            ->orderBy('acct_name', 'asc')
            ->get();

        $filterAndSortAccounts = function ($isDebt, $isRetirement) use ($accounts) {
            return $accounts->filter(function ($account) use ($isDebt, $isRetirement) {
                return !$account->acct_is_debt == !$isDebt && !$account->acct_is_retirement == !$isRetirement;
            });
        };

        $assetAccounts = $filterAndSortAccounts(false, false);
        $liabilityAccounts = $filterAndSortAccounts(true, false);
        $retirementAccounts = $filterAndSortAccounts(false, true);

        $activeChartAccounts = $accounts->filter(function ($account) {
            return is_null($account->when_closed);
        });

        return response()->json([
            'assetAccounts' => $assetAccounts->values(),
            'liabilityAccounts' => $liabilityAccounts->values(),
            'retirementAccounts' => $retirementAccounts->values(),
            'activeChartAccounts' => $activeChartAccounts->values(),
        ]);
    }

    public function updateBalance(Request $request)
    {
        $request->validate([
            'acct_id' => 'required|integer',
            'balance' => 'required|string',
        ]);

        $uid = Auth::id();

        FinAccounts::where('acct_id', $request->acct_id)
            ->where('acct_owner', $uid)
            ->update([
                'acct_last_balance' => $request->balance,
                'acct_last_balance_date' => now(),
            ]);

        DB::table('fin_account_balance_snapshot')->insert([
            'acct_id' => $request->acct_id,
            'balance' => $request->balance,
            'when_added' => now(),
        ]);

        return response()->json(['success' => true]);
    }

    public function createAccount(Request $request)
    {
        $request->validate([
            'accountName' => 'required|string',
            'isDebt' => 'boolean',
            'isRetirement' => 'boolean',
        ]);

        $uid = Auth::id();

        FinAccounts::create([
            'acct_owner' => $uid,
            'acct_name' => $request->accountName,
            'acct_is_debt' => $request->isDebt,
            'acct_is_retirement' => $request->isRetirement,
            'acct_last_balance' => '0',
        ]);

        return response()->json(['success' => true]);
    }

    public function chartData(Request $request)
    {
        $uid = Auth::id();

        $accounts = FinAccounts::where('acct_owner', $uid)
            ->whereNull('when_deleted')
            ->whereNull('when_closed')
            ->get();

        // Get balance history for active accounts
        $balanceHistory = DB::table('fin_account_balance_snapshot')
            ->whereIn('acct_id', $accounts->pluck('acct_id')->toArray())
            ->orderBy('when_added', 'asc')
            ->get();

        // Group snapshots by quarter and account, keeping only the latest balance per quarter
        $quarterlyBalances = [];
        foreach ($balanceHistory as $snapshot) {
            $date = $snapshot->when_added;
            $quarter = date('Y', strtotime($date)) . '-Q' . ceil(date('n', strtotime($date)) / 3);

            if (!isset($quarterlyBalances[$quarter])) {
                $quarterlyBalances[$quarter] = [];
            }

            // Always update the balance since we're iterating in chronological order
            $quarterlyBalances[$quarter][$snapshot->acct_id] = $snapshot->balance;
        }

        // Sort quarters chronologically
        ksort($quarterlyBalances);
        $sortedQuarters = array_keys($quarterlyBalances);

        // Convert to array format needed by chart, carrying forward previous balances
        $chartDataArray = [];
        foreach ($sortedQuarters as $index => $quarter) {
            $currentBalances = $quarterlyBalances[$quarter];
            $previousQuarter = $index > 0 ? $sortedQuarters[$index - 1] : null;
            $previousBalances = $previousQuarter ? $quarterlyBalances[$previousQuarter] : [];

            $row = [$quarter];
            foreach ($accounts as $account) {
                // Use current balance if available, otherwise use previous quarter's balance, or '0' if no previous
                $balance = $currentBalances[$account->acct_id] ?? $previousBalances[$account->acct_id] ?? '0';
                // Negate balance for liability accounts
                $row[] = $account->acct_is_debt ? '-' . $balance : $balance;
            }
            $chartDataArray[] = $row;
        }

        return response()->json([
            'data' => $chartDataArray,
            'labels' => $accounts->pluck('acct_name')->toArray(),
            'isNegative' => $accounts->pluck('acct_is_debt')->toArray(),
            'isRetirement' => $accounts->pluck('acct_is_retirement')->toArray(),
        ]);
    }

    public function getLineItems(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $query = FinAccountLineItems::where('t_account', $account->acct_id)
            ->with(['tags', 'parentTransaction.account', 'childTransactions.account'])
            ->orderBy('t_date', 'desc');

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('t_date', [$request->start_date, $request->end_date]);
        }

        $lineItems = $query->get();

        // Transform line items to include parent_of_t_ids array
        $lineItems = $lineItems->map(function ($item) {
            $itemArray = $item->toArray();
            
            // Add parent_of_t_ids array (IDs of child transactions)
            $itemArray['parent_of_t_ids'] = $item->childTransactions->pluck('t_id')->toArray();
            
            // Add parent transaction info if exists
            if ($item->parentTransaction) {
                $itemArray['parent_transaction'] = [
                    't_id' => $item->parentTransaction->t_id,
                    't_account' => $item->parentTransaction->t_account,
                    'acct_name' => $item->parentTransaction->account?->acct_name,
                    't_date' => $item->parentTransaction->t_date,
                    't_description' => $item->parentTransaction->t_description,
                    't_amt' => $item->parentTransaction->t_amt,
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
            unset($itemArray['parent_transaction_raw']);
            unset($itemArray['child_transactions_raw']);
            
            return $itemArray;
        });

        return response()->json($lineItems);
    }

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

    public function getUserTags(Request $request)
    {
        $uid = Auth::id();

        $tags = FinAccountTag::where('tag_userid', $uid)
            ->whereNull('when_deleted')
            ->get(['tag_id', 'tag_label', 'tag_color']);

        return response()->json($tags);
    }

    public function applyTagToTransactions(Request $request)
    {
        $uid = Auth::id();

        $request->validate([
            'tag_id' => 'required|integer',
            'transaction_ids' => 'required|string',
        ]);

        $tag = FinAccountTag::where('tag_id', $request->tag_id)
            ->where('tag_userid', $uid)
            ->firstOrFail();

        $transaction_ids = explode(',', $request->transaction_ids);

        foreach ($transaction_ids as $transaction_id) {
            FinAccountLineItemTagMap::updateOrCreate(
                [
                    't_id' => $transaction_id,
                    'tag_id' => $tag->tag_id,
                ],
                [
                    'when_deleted' => null,
                ]
            );
        }

        return response()->json(['success' => true]);
    }

    public function updateTransactionComment(Request $request, $transaction_id)
    {
        $uid = Auth::id();

        $request->validate([
            'comment' => 'nullable|string',
        ]);

        $lineItem = FinAccountLineItems::where('t_id', $transaction_id)
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        $lineItem->update(['t_comment' => $request->comment]);

        return response()->json(['success' => true]);
    }

    public function getBalanceTimeseries(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $balances = DB::table('fin_account_balance_snapshot as fabs')
            ->leftJoin('fin_statement_details as fsd', 'fabs.snapshot_id', '=', 'fsd.snapshot_id')
            ->where('fabs.acct_id', $account->acct_id)
            ->select('fabs.snapshot_id', 'fabs.when_added', 'fabs.balance', DB::raw('count(fsd.id) as lineItemCount'))
            ->groupBy('fabs.snapshot_id', 'fabs.when_added', 'fabs.balance')
            ->orderBy('fabs.when_added', 'asc')
            ->get();

        return response()->json($balances);
    }

    public function deleteBalanceSnapshot(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $request->validate([
            'when_added' => 'required|string',
            'balance' => 'required|string',
        ]);

        DB::table('fin_account_balance_snapshot')
            ->where('acct_id', $account->acct_id)
            ->where('when_added', $request->when_added)
            ->where('balance', $request->balance)
            ->delete();

        return response()->json(['success' => true]);
    }

    public function renameAccount(Request $request, $account_id)
    {
        $request->validate([
            'newName' => 'required|string',
        ]);

        $uid = Auth::id();

        FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->firstOrFail()
            ->update(['acct_name' => $request->newName]);

        return response()->json(['success' => true]);
    }

    public function updateAccountClosed(Request $request, $account_id)
    {
        $request->validate([
            'closedDate' => 'nullable|date',
        ]);

        $uid = Auth::id();

        FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->firstOrFail()
            ->update(['when_closed' => $request->closedDate]);

        return response()->json(['success' => true]);
    }

    public function updateAccountFlags(Request $request, $account_id)
    {
        $request->validate([
            'isDebt' => 'boolean',
            'isRetirement' => 'boolean',
        ]);

        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->firstOrFail();

        $account->update([
            'acct_is_debt' => $request->has('isDebt') ? $request->isDebt : $account->acct_is_debt,
            'acct_is_retirement' => $request->has('isRetirement') ? $request->isRetirement : $account->acct_is_retirement,
        ]);

        return response()->json(['success' => true]);
    }

    public function deleteAccount(Request $request, $account_id)
    {
        $uid = Auth::id();

        $account = FinAccounts::where('acct_id', $account_id)
            ->where('acct_owner', $uid)
            ->firstOrFail();

        DB::transaction(function () use ($account) {
            FinAccountLineItems::where('t_account', $account->acct_id)
                ->update(['when_deleted' => now()]);

            $account->update(['when_deleted' => now()]);
        });

        return response()->json(['success' => true]);
    }

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
                'parent_t_id' => $item['parent_t_id'] ?? null,
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

        $lineItem->update($updateData);

        return response()->json(['success' => true]);
    }

    /**
     * Find potential transactions to link based on date and amount criteria
     */
    public function findLinkableTransactions(Request $request, $transaction_id)
    {
        $uid = Auth::id();

        // Get the source transaction
        $sourceTransaction = FinAccountLineItems::where('t_id', $transaction_id)
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        $sourceDate = $sourceTransaction->t_date;
        $sourceAmount = abs(floatval($sourceTransaction->t_amt));

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
            ->whereNull('parent_t_id') // Exclude already-linked child transactions
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
        ]);
    }

    /**
     * Link two transactions (set parent-child relationship)
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
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        $childTransaction = FinAccountLineItems::where('t_id', $request->child_t_id)
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        // Check if the child is not already linked
        if ($childTransaction->parent_t_id !== null) {
            return response()->json([
                'success' => false,
                'error' => 'Child transaction is already linked to another parent.',
            ], 400);
        }

        // Set the link
        $childTransaction->update(['parent_t_id' => $parentTransaction->t_id]);

        return response()->json([
            'success' => true,
            'parent_t_id' => $parentTransaction->t_id,
            'child_t_id' => $childTransaction->t_id,
        ]);
    }

    /**
     * Unlink a transaction (remove parent-child relationship)
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
            if ($transaction->parent_t_id != $request->linked_t_id) {
                return response()->json([
                    'success' => false,
                    'error' => 'Transaction is not linked to the specified parent.',
                ], 400);
            }
            $transaction->update(['parent_t_id' => null]);
        } else {
            // We want to unlink a child from this transaction
            $childTransaction = FinAccountLineItems::where('t_id', $request->linked_t_id)
                ->where('parent_t_id', $transaction_id)
                ->whereHas('account', function ($query) use ($uid) {
                    $query->where('acct_owner', $uid);
                })
                ->firstOrFail();

            $childTransaction->update(['parent_t_id' => null]);
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
            ->with(['parentTransaction.account', 'childTransactions.account'])
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        $result = [
            't_id' => $transaction->t_id,
            't_account' => $transaction->t_account,
            't_date' => $transaction->t_date,
            't_description' => $transaction->t_description,
            't_amt' => $transaction->t_amt,
            'parent_t_id' => $transaction->parent_t_id,
            'parent_transaction' => null,
            'child_transactions' => [],
        ];

        if ($transaction->parentTransaction) {
            $result['parent_transaction'] = [
                't_id' => $transaction->parentTransaction->t_id,
                't_account' => $transaction->parentTransaction->t_account,
                'acct_name' => $transaction->parentTransaction->account?->acct_name,
                't_date' => $transaction->parentTransaction->t_date,
                't_description' => $transaction->parentTransaction->t_description,
                't_amt' => $transaction->parentTransaction->t_amt,
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
