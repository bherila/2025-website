<?php

namespace App\Http\Controllers;

use App\Models\FinAccountLineItems;
use App\Models\FinAccounts;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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

            if (! $item->t_schc_category) {
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

        if (! empty($dataToInsert)) {
            FinAccountLineItems::insert($dataToInsert);
        }

        return response()->json([
            'success' => true,
            'imported' => count($dataToInsert),
        ]);
    }

    /**
     * Create a single transaction for an account
     */
    public function createTransaction(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $request->validate([
            't_date' => 'required|date',
            't_type' => 'nullable|string|max:50',
            't_amt' => 'nullable|numeric',
            't_description' => 'nullable|string|max:255',
            't_symbol' => 'nullable|string|max:20',
            't_qty' => 'nullable|numeric',
            't_price' => 'nullable|numeric',
            't_commission' => 'nullable|numeric',
            't_fee' => 'nullable|numeric',
            't_comment' => 'nullable|string|max:255',
        ]);

        $transaction = FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => $request->t_date,
            't_type' => $request->t_type,
            't_amt' => $request->t_amt ?? 0,
            't_description' => $request->t_description,
            't_symbol' => $request->t_symbol,
            't_qty' => $request->t_qty ?? 0,
            't_price' => $request->t_price ?? 0,
            't_commission' => $request->t_commission ?? 0,
            't_fee' => $request->t_fee ?? 0,
            't_comment' => $request->t_comment,
            't_source' => 'manual',
        ]);

        return response()->json([
            'success' => true,
            't_id' => $transaction->t_id,
        ]);
    }

    /**
     * Update a transaction with multiple fields
     */
    public function updateTransaction(Request $request, $transaction_id)
    {
        $uid = Auth::id();

        $request->validate([
            't_date' => 'nullable|date',
            't_type' => 'nullable|string|max:50',
            't_amt' => 'nullable|numeric',
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
            't_date' => $request->t_date,
            't_type' => $request->t_type,
            't_amt' => $request->t_amt,
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
        if ($request->has('t_date')) {
            $updateData['t_date'] = $request->t_date;
        }
        if ($request->has('t_type')) {
            $updateData['t_type'] = $request->t_type;
        }
        if ($request->has('t_amt')) {
            $updateData['t_amt'] = $request->t_amt ?? 0;
        }
        if ($request->has('t_comment')) {
            $updateData['t_comment'] = $request->t_comment;
        }
        if ($request->has('t_description')) {
            $updateData['t_description'] = $request->t_description;
        }
        if ($request->has('t_qty')) {
            $updateData['t_qty'] = $request->t_qty ?? 0;
        }
        if ($request->has('t_price')) {
            $updateData['t_price'] = $request->t_price ?? 0;
        }
        if ($request->has('t_commission')) {
            $updateData['t_commission'] = $request->t_commission ?? 0;
        }
        if ($request->has('t_fee')) {
            $updateData['t_fee'] = $request->t_fee ?? 0;
        }
        if ($request->has('t_symbol')) {
            $updateData['t_symbol'] = $request->t_symbol;
        }
        if ($request->has('t_memo')) {
            $updateData['t_memo'] = $request->t_memo;
        }

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
}
