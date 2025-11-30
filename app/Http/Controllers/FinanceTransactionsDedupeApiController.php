<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Models\FinAccounts;
use App\Models\FinAccountLineItems;

class FinanceTransactionsDedupeApiController extends Controller
{
    /**
     * Find duplicate transactions in an account
     * Duplicates are detected by: same date + qty + amount + symbol + balance
     * Also checks if description/memo are identical or swapped
     * 
     * Transactions marked as t_is_not_duplicate=1 are excluded from duplicate detection.
     * At the end, transactions that had no duplicates are marked as t_is_not_duplicate=1.
     * 
     * Note: We keep the NEWER t_id (highest) and delete older ones because when re-importing
     * CSV data, the newer import may have more complete/updated data.
     */
    public function findDuplicates(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        // Build query for transactions - exclude those already marked as not duplicate
        $query = FinAccountLineItems::where('t_account', $account->acct_id)
            ->where('t_is_not_duplicate', false) // Only check transactions not already verified
            ->with(['tags'])
            ->orderBy('t_date', 'asc')
            ->orderBy('t_id', 'asc');

        // Filter by year if provided
        $year = null;
        if ($request->has('year') && $request->year !== 'all') {
            $year = intval($request->year);
            $query->whereYear('t_date', $year);
        }

        // Get all transactions for the account, sorted by date
        $transactions = $query->get();
        
        // Track which transaction IDs are involved in duplicate groups
        $idsInDuplicateGroups = [];

        $groups = [];
        $seenIds = [];

        foreach ($transactions as $transaction) {
            if (in_array($transaction->t_id, $seenIds)) {
                continue;
            }

            // Build a key for grouping: date + normalized qty + normalized amount + symbol
            $date = $transaction->t_date;
            $qty = $this->normalizeValue($transaction->t_qty);
            $amt = $this->normalizeValue($transaction->t_amt);
            $symbol = strtoupper(trim($transaction->t_symbol ?? ''));
            $balance = $this->normalizeValue($transaction->t_account_balance);

            $groupKey = "{$date}|{$qty}|{$amt}|{$symbol}";

            // Find other transactions with the same key
            $duplicates = $transactions->filter(function ($t) use ($transaction, $date, $qty, $amt, $symbol, $balance, $seenIds) {
                if ($t->t_id === $transaction->t_id || in_array($t->t_id, $seenIds)) {
                    return false;
                }

                $tDate = $t->t_date;
                $tQty = $this->normalizeValue($t->t_qty);
                $tAmt = $this->normalizeValue($t->t_amt);
                $tSymbol = strtoupper(trim($t->t_symbol ?? ''));
                $tBalance = $this->normalizeValue($t->t_account_balance);

                if ($tDate !== $date || $tQty !== $qty || $tAmt !== $amt || $tSymbol !== $symbol || $tBalance !== $balance) {
                    return false;
                }

                // Check if description/memo are identical or swapped
                $desc1 = $this->normalizeString($transaction->t_description);
                $memo1 = $this->normalizeString($transaction->t_comment);
                $desc2 = $this->normalizeString($t->t_description);
                $memo2 = $this->normalizeString($t->t_comment);

                // Identical
                if ($desc1 === $desc2 && $memo1 === $memo2) {
                    return true;
                }

                // Swapped
                if ($desc1 === $memo2 && $memo1 === $desc2) {
                    return true;
                }

                return false;
            });

            if ($duplicates->count() > 0) {
                // Create a group with all matching transactions
                $allInGroup = collect([$transaction])->merge($duplicates);
                
                foreach ($allInGroup as $t) {
                    $seenIds[] = $t->t_id;
                    $idsInDuplicateGroups[] = $t->t_id;
                }

                // The last transaction (highest t_id) is the one to keep
                // We keep the NEWER t_id because re-imported CSV may have updated data
                $keepTransaction = $allInGroup->sortBy('t_id')->last();
                $deleteIds = $allInGroup->filter(fn($t) => $t->t_id !== $keepTransaction->t_id)->pluck('t_id')->toArray();

                $groups[] = [
                    'key' => $groupKey,
                    'transactions' => $allInGroup->map(function ($t) {
                        return [
                            't_id' => $t->t_id,
                            't_date' => $t->t_date,
                            't_type' => $t->t_type,
                            't_description' => $t->t_description,
                            't_symbol' => $t->t_symbol,
                            't_qty' => $t->t_qty,
                            't_price' => $t->t_price,
                            't_amt' => $t->t_amt,
                            't_comment' => $t->t_comment,
                            'parent_t_id' => $t->parent_t_id,
                            'tags' => $t->tags->map(fn($tag) => [
                                'tag_id' => $tag->tag_id,
                                'tag_label' => $tag->tag_label
                            ])->toArray(),
                        ];
                    })->values()->toArray(),
                    'keepId' => $keepTransaction->t_id,
                    'deleteIds' => $deleteIds,
                ];

                // Limit to 150 groups
                if (count($groups) >= 150) {
                    break;
                }
            }
        }

        // Mark transactions that had no duplicates as verified non-duplicates
        // Only do this if we scanned all transactions (not limited by group count)
        $markedAsNonDuplicate = 0;
        if (count($groups) < 150) {
            $allTransactionIds = $transactions->pluck('t_id')->toArray();
            $idsWithoutDuplicates = array_diff($allTransactionIds, $idsInDuplicateGroups);
            
            if (!empty($idsWithoutDuplicates)) {
                $markedAsNonDuplicate = FinAccountLineItems::whereIn('t_id', $idsWithoutDuplicates)
                    ->where('t_account', $account->acct_id)
                    ->update(['t_is_not_duplicate' => true]);
            }
        }

        // Count how many transactions were already marked as non-duplicate (for UI info)
        $previouslyMarkedQuery = FinAccountLineItems::where('t_account', $account->acct_id)
            ->where('t_is_not_duplicate', true);
        if ($year) {
            $previouslyMarkedQuery->whereYear('t_date', $year);
        }
        $previouslyMarkedCount = $previouslyMarkedQuery->count();

        return response()->json([
            'groups' => $groups,
            'total' => count($groups),
            'markedAsNonDuplicate' => $markedAsNonDuplicate,
            'previouslyMarkedCount' => $previouslyMarkedCount,
        ]);
    }

    /**
     * Merge duplicate transactions (bulk operation)
     * - Combines tags from all transactions onto the kept transaction
     * - Reassigns parent_t_id from deleted transactions to kept transaction
     * - Deletes the specified transactions
     */
    public function mergeDuplicates(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $request->validate([
            'merges' => 'required|array|min:1',
            'merges.*.keepId' => 'required|integer',
            'merges.*.deleteIds' => 'required|array|min:1',
            'merges.*.deleteIds.*' => 'integer',
        ]);

        $merges = $request->merges;
        $totalDeleted = 0;
        $totalTagsAdded = 0;

        DB::beginTransaction();
        try {
            foreach ($merges as $merge) {
                $keepId = $merge['keepId'];
                $deleteIds = $merge['deleteIds'];

                // Verify the kept transaction exists and belongs to this account
                $keepTransaction = FinAccountLineItems::where('t_id', $keepId)
                    ->where('t_account', $account->acct_id)
                    ->first();

                if (!$keepTransaction) {
                    continue; // Skip if keep transaction not found
                }

                // Verify delete transactions exist and belong to this account
                $deleteTransactions = FinAccountLineItems::whereIn('t_id', $deleteIds)
                    ->where('t_account', $account->acct_id)
                    ->with(['tags'])
                    ->get();

                if ($deleteTransactions->count() === 0) {
                    continue; // Skip if no delete transactions found
                }

                // Collect all tag IDs from transactions to delete
                $tagIdsToAdd = [];
                foreach ($deleteTransactions as $t) {
                    foreach ($t->tags as $tag) {
                        $tagIdsToAdd[] = $tag->tag_id;
                    }
                }
                $tagIdsToAdd = array_unique($tagIdsToAdd);

                // Get existing tag IDs on kept transaction
                $existingTagIds = DB::table('fin_account_line_item_tag_map')
                    ->where('t_id', $keepId)
                    ->pluck('tag_id')
                    ->toArray();

                // Add missing tags to kept transaction
                $newTagIds = array_diff($tagIdsToAdd, $existingTagIds);
                foreach ($newTagIds as $tagId) {
                    DB::table('fin_account_line_item_tag_map')->insert([
                        't_id' => $keepId,
                        'tag_id' => $tagId,
                    ]);
                }
                $totalTagsAdded += count($newTagIds);

                // Reassign parent_t_id from deleted transactions to kept transaction
                // This handles child transactions that were linked to the deleted ones
                FinAccountLineItems::whereIn('parent_t_id', $deleteIds)
                    ->update(['parent_t_id' => $keepId]);

                // Delete tag mappings for deleted transactions
                DB::table('fin_account_line_item_tag_map')
                    ->whereIn('t_id', $deleteIds)
                    ->delete();

                // Delete the transactions
                $deletedCount = FinAccountLineItems::whereIn('t_id', $deleteIds)
                    ->where('t_account', $account->acct_id)
                    ->delete();
                
                $totalDeleted += $deletedCount;

                DB::commit();
            }

            return response()->json([
                'success' => true,
                'mergedCount' => $totalDeleted,
                'tagsAdded' => $totalTagsAdded,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['error' => 'Failed to merge transactions: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Normalize a numeric value for comparison
     * Treats null, empty string, 0, and "0" as equivalent
     */
    private function normalizeValue($value): string
    {
        if ($value === null || $value === '' || $value === 0 || $value === '0' || $value === 0.0 || $value === '0.0' || $value === '0.00') {
            return '0';
        }
        // Round to 2 decimal places for comparison
        return number_format((float) $value, 2, '.', '');
    }

    /**
     * Normalize a string value for comparison
     * Treats null and empty string as equivalent, trims whitespace
     */
    private function normalizeString($value): string
    {
        if ($value === null || $value === '') {
            return '';
        }
        return strtolower(trim($value));
    }
}
