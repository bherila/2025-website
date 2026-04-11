<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class FinanceTransactionsApiController extends Controller
{
    /**
     * Get line items (transactions) for one or all accounts.
     * Pass account_id = 'all' (or null) to retrieve transactions across all accounts.
     */
    public function getLineItems(Request $request, $account_id = null)
    {
        $uid = Auth::id();

        if ($account_id && $account_id !== 'all') {
            $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();
            $query = FinAccountLineItems::where('t_account', $account->acct_id);
        } else {
            // Get all account IDs for this user
            $accountIds = FinAccounts::where('acct_owner', $uid)->pluck('acct_id');
            $query = FinAccountLineItems::whereIn('t_account', $accountIds);
        }

        $query->with(['tags', 'parentTransactions.account', 'childTransactions.account', 'clientExpense.clientCompany'])
            ->orderBy('t_date', 'desc');

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('t_date', [$request->start_date, $request->end_date]);
        }

        // Filter by year if provided
        if ($request->has('year')) {
            $year = $request->year;
            $query->whereYear('t_date', $year);
        }

        // Filter by tag if provided
        if ($request->has('tag')) {
            $tagLabel = $request->tag;
            $query->whereHas('tags', function ($q) use ($tagLabel) {
                $q->where('fin_account_tag.tag_label', $tagLabel);
            });
        }

        // Filter by type if provided
        if ($request->has('filter')) {
            $filter = $request->filter;
            if ($filter === 'stock') {
                $query->whereNotNull('t_symbol')->where('t_symbol', '!=', '');
            } elseif ($filter === 'cash') {
                $query->where(function ($q) {
                    $q->whereNull('t_symbol')->orWhere('t_symbol', '');
                });
            }
        }

        // Return a streamed response to save memory on large datasets
        return response()->stream(function () use ($query) {
            echo '[';
            $first = true;
            // lazy() chunks the results and eager loads relations for each chunk
            $query->lazy()->each(function ($item) use (&$first) {
                if (! $first) {
                    echo ',';
                }
                echo json_encode($this->transformLineItem($item));
                $first = false;
            });
            echo ']';
        }, 200, [
            'Content-Type' => 'application/json',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
        ]);
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

        // Unlink any lots referencing this transaction before deleting
        FinAccountLot::where('open_t_id', $request->t_id)->update(['open_t_id' => null]);
        FinAccountLot::where('close_t_id', $request->t_id)->update(['close_t_id' => null]);

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

        $data = $request->json()->all();
        // Check if we have a top-level statement_id or if it's per item
        $statementId = $request->input('statement_id');
        $lineItems = isset($data['transactions']) ? $data['transactions'] : (isset($data[0]) ? $data : []);

        $dataToInsert = [];

        foreach ($lineItems as $item) {
            $dataToInsert[] = [
                't_account' => $account->acct_id,
                'statement_id' => $item['statement_id'] ?? $statementId,
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
                'when_added' => now(),
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
     * Get available years for transactions in one or all accounts.
     * Pass account_id = 'all' (or omit to use the default) to retrieve years across all accounts.
     */
    public function getTransactionYears(Request $request, $account_id = 'all')
    {
        $uid = Auth::id();

        if ($account_id === 'all') {
            $accountIds = FinAccounts::where('acct_owner', $uid)->pluck('acct_id');
            $query = FinAccountLineItems::whereIn('t_account', $accountIds)->whereNotNull('t_date');
        } else {
            $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();
            $query = FinAccountLineItems::where('t_account', $account->acct_id)->whereNotNull('t_date');
        }

        // Use a database-agnostic approach: extract year in PHP
        $years = $query->pluck('t_date')
            ->map(fn ($date) => (int) substr((string) $date, 0, 4))
            ->filter(fn ($year) => $year > 0)
            ->unique()
            ->sort(fn ($a, $b) => $b - $a)
            ->values()
            ->toArray();

        return response()->json($years);
    }

    /**
     * Transform a line item (transaction) to its API representation
     */
    protected function transformLineItem($item)
    {
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

        // Add client expense info if exists (store in a temp variable first)
        $clientExpenseData = null;
        if ($item->clientExpense) {
            $clientExpenseData = [
                'id' => $item->clientExpense->id,
                'description' => $item->clientExpense->description,
                'amount' => $item->clientExpense->amount,
                'is_reimbursable' => $item->clientExpense->is_reimbursable,
                'client_company' => $item->clientExpense->clientCompany ? [
                    'id' => $item->clientExpense->clientCompany->id,
                    'company_name' => $item->clientExpense->clientCompany->company_name,
                    'slug' => $item->clientExpense->clientCompany->slug,
                ] : null,
            ];
        }

        // Remove the raw relationship data
        unset($itemArray['parent_transactions']);
        unset($itemArray['client_expense']); // Remove the raw Eloquent relation data

        // Add the formatted client expense data back
        if ($clientExpenseData) {
            $itemArray['client_expense'] = $clientExpenseData;
        }

        if (! $item->t_schc_category) {
            unset($itemArray['t_schc_category']);
        }
        if (empty($itemArray['parent_of_t_ids'])) {
            unset($itemArray['parent_of_t_ids']);
        }

        return $itemArray;
    }

    /**
     * Batch-delete multiple transactions at once.
     *
     * POST /api/finance/transactions/batch-delete
     * Body: { "t_ids": [1, 2, 3, ...] }
     *
     * Only transactions belonging to the authenticated user are deleted.
     * Returns the count of deleted rows.
     */
    public function batchDelete(Request $request): JsonResponse
    {
        $request->validate([
            't_ids' => 'required|array|min:1|max:1000',
            't_ids.*' => 'required|integer',
        ]);

        $uid = Auth::id();

        // Collect all account IDs owned by this user
        $userAccountIds = FinAccounts::where('acct_owner', $uid)->pluck('acct_id');

        $tIds = $request->input('t_ids');

        // Unlink lots referencing these transactions
        FinAccountLot::whereIn('open_t_id', $tIds)->update(['open_t_id' => null]);
        FinAccountLot::whereIn('close_t_id', $tIds)->update(['close_t_id' => null]);

        $deleted = FinAccountLineItems::whereIn('t_id', $tIds)
            ->whereIn('t_account', $userAccountIds)
            ->delete();

        return response()->json(['success' => true, 'deleted' => $deleted]);
    }

    /**
     * Batch-update a subset of fields on multiple transactions.
     *
     * POST /api/finance/transactions/batch-update
     * Body: { "t_ids": [1, 2, 3], "fields": { "t_schc_category": "Office", ... } }
     *
     * Allowed fields: t_date, t_type, t_amt, t_comment, t_description, t_qty, t_price, t_commission, t_fee, t_symbol, t_schc_category
     * Only transactions belonging to the authenticated user are updated.
     */
    public function batchUpdate(Request $request): JsonResponse
    {
        $request->validate([
            't_ids' => 'required|array|min:1|max:1000',
            't_ids.*' => 'required|integer',
            'fields' => 'required|array|min:1',
            'fields.t_date' => 'nullable|date',
            'fields.t_type' => 'nullable|string|max:50',
            'fields.t_amt' => 'nullable|numeric',
            'fields.t_comment' => 'nullable|string|max:255',
            'fields.t_description' => 'nullable|string|max:255',
            'fields.t_qty' => 'nullable|numeric',
            'fields.t_price' => 'nullable|numeric',
            'fields.t_commission' => 'nullable|numeric',
            'fields.t_fee' => 'nullable|numeric',
            'fields.t_symbol' => 'nullable|string|max:20',
            'fields.t_schc_category' => 'nullable|string|max:255',
        ]);

        $uid = Auth::id();

        $userAccountIds = FinAccounts::where('acct_owner', $uid)->pluck('acct_id');

        $tIds = $request->input('t_ids');
        $rawFields = $request->input('fields');

        // Only allow a safe whitelist of fields to be batch-updated
        $allowed = [
            't_date',
            't_type',
            't_amt',
            't_comment',
            't_description',
            't_qty',
            't_price',
            't_commission',
            't_fee',
            't_symbol',
            't_schc_category',
        ];
        $fields = array_intersect_key($rawFields, array_flip($allowed));

        if (empty($fields)) {
            return response()->json(['error' => 'No updatable fields provided.'], 422);
        }

        $updated = FinAccountLineItems::whereIn('t_id', $tIds)
            ->whereIn('t_account', $userAccountIds)
            ->update($fields);

        return response()->json(['success' => true, 'updated' => $updated]);
    }
}
