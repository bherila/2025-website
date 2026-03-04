<?php

namespace App\Http\Controllers;

use App\Models\FinAccountLineItems;
use App\Models\FinAccounts;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

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

        // Handle reanalyze parameter
        $reanalyze = filter_var($request->input('reanalyze'), FILTER_VALIDATE_BOOLEAN);

        // Filter by year if provided
        $year = null;
        if ($request->has('year') && $request->year !== 'all') {
            $year = intval($request->year);
        }

        // Count how many transactions were already marked as non-duplicate (for UI info)
        $previouslyMarkedQuery = FinAccountLineItems::where('t_account', $account->acct_id)
            ->where('t_is_not_duplicate', true);
        if ($year) {
            $previouslyMarkedQuery->whereYear('t_date', $year);
        }
        $previouslyMarkedCount = $previouslyMarkedQuery->count();

        // Step 1: Identify candidate duplicate groups using SQL GROUP BY
        // We omit t_account_balance to catch duplicates imported with different running balances
        $candidateQuery = FinAccountLineItems::where('t_account', $account->acct_id)
            ->whereNull('when_deleted')
            ->select('t_date', 't_qty', 't_amt', 't_symbol')
            ->groupBy('t_date', 't_qty', 't_amt', 't_symbol')
            ->havingRaw('COUNT(*) > 1');

        if (!$reanalyze) {
            $candidateQuery->where('t_is_not_duplicate', false);
        }

        if ($year) {
            $candidateQuery->whereYear('t_date', $year);
        }

        $candidates = $candidateQuery->get();

        if ($candidates->isEmpty()) {
            // No duplicates found, mark ALL remaining as non-duplicate if not filtered too much
            $markedAsNonDuplicate = FinAccountLineItems::where('t_account', $account->acct_id)
                ->where('t_is_not_duplicate', false);
            if ($year) {
                $markedAsNonDuplicate->whereYear('t_date', $year);
            }
            $count = $markedAsNonDuplicate->update(['t_is_not_duplicate' => true]);

            return response()->json([
                'groups' => [],
                'total' => 0,
                'markedAsNonDuplicate' => $count,
                'previouslyMarkedCount' => $previouslyMarkedCount,
            ]);
        }

        // Step 2: Fetch all transactions that match the candidate criteria
        $query = FinAccountLineItems::where('t_account', $account->acct_id)
            ->whereNull('when_deleted')
            ->with(['tags', 'parentTransactions:t_id']);

        if (!$reanalyze) {
            $query->where('t_is_not_duplicate', false);
        }

        if ($year) {
            $query->whereYear('t_date', $year);
        }

        // Filter to only records that could be part of a duplicate group
        $query->where(function ($q) use ($candidates) {
            foreach ($candidates as $candidate) {
                $q->orWhere(function ($sub) use ($candidate) {
                    $sub->where('t_date', $candidate->t_date)
                        ->where('t_qty', $candidate->t_qty)
                        ->where('t_amt', $candidate->t_amt)
                        ->where('t_symbol', $candidate->t_symbol);
                });
            }
        });

        $transactions = $query->orderBy('t_date', 'asc')
            ->orderBy('t_id', 'asc')
            ->get();

        // Step 3: Group transactions by their identifying fields in PHP
        $initialGroups = [];
        foreach ($transactions as $t) {
            $qty = $this->normalizeValue($t->t_qty);
            $amt = $this->normalizeValue($t->t_amt);
            $symbol = strtoupper(trim($t->t_symbol ?? ''));
            // Keys no longer include balance
            $key = "{$t->t_date}|{$qty}|{$amt}|{$symbol}";

            $initialGroups[$key][] = $t;
        }

        // Step 4: Refine groups by checking description/memo (swapped or identical)
        $groups = [];
        $idsInDuplicateGroups = [];
        $limitReached = false;

        foreach ($initialGroups as $key => $groupTransactions) {
            if (count($groups) >= 150) {
                $limitReached = true;
                break;
            }

            if (count($groupTransactions) < 2) {
                continue;
            }

            // Sub-group by description/memo patterns
            $refinedGroups = [];
            $usedIds = [];

            for ($i = 0; $i < count($groupTransactions); $i++) {
                $t1 = $groupTransactions[$i];
                if (isset($usedIds[$t1->t_id])) {
                    continue;
                }

                $currentRefinedGroup = [$t1];
                $desc1 = $this->normalizeString($t1->t_description);
                $memo1 = $this->normalizeString($t1->t_comment);

                for ($j = $i + 1; $j < count($groupTransactions); $j++) {
                    $t2 = $groupTransactions[$j];
                    if (isset($usedIds[$t2->t_id])) {
                        continue;
                    }

                    $desc2 = $this->normalizeString($t2->t_description);
                    $memo2 = $this->normalizeString($t2->t_comment);

                    // Identical or Swapped
                    if (($desc1 === $desc2 && $memo1 === $memo2) || ($desc1 === $memo2 && $memo1 === $desc2)) {
                        $currentRefinedGroup[] = $t2;
                        $usedIds[$t2->t_id] = true;
                    }
                }

                if (count($currentRefinedGroup) > 1) {
                    $usedIds[$t1->t_id] = true;
                    $refinedGroups[] = $currentRefinedGroup;
                }
            }

            foreach ($refinedGroups as $allInGroup) {
                if (count($groups) >= 150) {
                    $limitReached = true;
                    break;
                }

                $allInGroup = collect($allInGroup);
                foreach ($allInGroup as $t) {
                    $idsInDuplicateGroups[] = $t->t_id;
                }

                $keepTransaction = $allInGroup->sort(function ($a, $b) {
                    // Prioritize those already marked as not duplicate
                    if ($a->t_is_not_duplicate && !$b->t_is_not_duplicate)
                        return 1;
                    if (!$a->t_is_not_duplicate && $b->t_is_not_duplicate)
                        return -1;

                    // Fallback to ID (prefer newer)
                    return $a->t_id <=> $b->t_id;
                })->last();

                $deleteIds = $allInGroup->filter(fn($t) => $t->t_id !== $keepTransaction->t_id)->pluck('t_id')->toArray();

                $groups[] = [
                    'key' => $key,
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
                            't_is_not_duplicate' => (bool) $t->t_is_not_duplicate,
                            'parent_t_id' => $t->parentTransactions->first()?->t_id,
                            'tags' => $t->tags->map(fn($tag) => [
                                'tag_id' => $tag->tag_id,
                                'tag_label' => $tag->tag_label,
                            ])->toArray(),
                        ];
                    })->values()->toArray(),
                    'keepId' => $keepTransaction->t_id,
                    'deleteIds' => $deleteIds,
                ];
            }
        }

        // Mark transactions that had no duplicates as verified non-duplicates
        // Only do this if we scanned all potential candidates (not limited by group count)
        $markedAsNonDuplicate = 0;
        if (!$limitReached) {
            $nonDuplicateQuery = FinAccountLineItems::where('t_account', $account->acct_id)
                ->where('t_is_not_duplicate', false);

            if ($year) {
                $nonDuplicateQuery->whereYear('t_date', $year);
            }

            if (!empty($idsInDuplicateGroups)) {
                $nonDuplicateQuery->whereNotIn('t_id', $idsInDuplicateGroups);
            }

            $markedAsNonDuplicate = $nonDuplicateQuery->update(['t_is_not_duplicate' => true]);
        }

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
     * - Marks unchecked groups as non-duplicates (t_is_not_duplicate = 1)
     */
    public function mergeDuplicates(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $request->validate([
            'merges' => 'sometimes|array',
            'merges.*.keepId' => 'required|integer',
            'merges.*.deleteIds' => 'required|array|min:1',
            'merges.*.deleteIds.*' => 'integer',
            'markAsNotDuplicateIds' => 'sometimes|array',
            'markAsNotDuplicateIds.*' => 'integer',
        ]);

        $merges = $request->merges ?? [];
        $markAsNotDuplicateIds = $request->markAsNotDuplicateIds ?? [];
        $totalDeleted = 0;
        $totalTagsAdded = 0;
        $totalMarkedAsNotDuplicate = 0;

        DB::beginTransaction();
        try {
            // Mark unchecked groups as non-duplicates
            if (!empty($markAsNotDuplicateIds)) {
                $totalMarkedAsNotDuplicate = FinAccountLineItems::whereIn('t_id', $markAsNotDuplicateIds)
                    ->where('t_account', $account->acct_id)
                    ->update(['t_is_not_duplicate' => true]);
            }

            if (empty($merges)) {
                DB::commit();

                return response()->json([
                    'success' => true,
                    'mergedCount' => 0,
                    'tagsAdded' => 0,
                    'markedAsNotDuplicate' => $totalMarkedAsNotDuplicate,
                ]);
            }

            // 1. Collect all IDs involved
            $allKeepIds = collect($merges)->pluck('keepId')->toArray();
            $allDeleteIds = [];
            foreach ($merges as $merge) {
                $allDeleteIds = array_merge($allDeleteIds, $merge['deleteIds']);
            }
            $allDeleteIds = array_unique($allDeleteIds);

            // 2. Fetch all transactions in bulk to minimize queries
            $allRelevantTransactions = FinAccountLineItems::whereIn('t_id', array_merge($allKeepIds, $allDeleteIds))
                ->where('t_account', $account->acct_id)
                ->with(['tags'])
                ->get()
                ->keyBy('t_id');

            // 3. Prepare bulk operations
            $allTagInserts = [];
            $parentReassignments = []; // Mapping for CASE statement: delete_id => keep_id
            $actualDeleteIds = [];

            foreach ($merges as $merge) {
                $keepId = $merge['keepId'];
                $deleteIds = $merge['deleteIds'];

                if (!$allRelevantTransactions->has($keepId)) {
                    continue;
                }

                $keepTransaction = $allRelevantTransactions->get($keepId);
                $existingTagIds = $keepTransaction->tags->pluck('tag_id')->toArray();

                foreach ($deleteIds as $delId) {
                    if (!$allRelevantTransactions->has($delId)) {
                        continue;
                    }

                    $delTransaction = $allRelevantTransactions->get($delId);
                    $actualDeleteIds[] = $delId;
                    $parentReassignments[$delId] = $keepId;

                    foreach ($delTransaction->tags as $tag) {
                        if (!in_array($tag->tag_id, $existingTagIds)) {
                            $allTagInserts[] = [
                                't_id' => $keepId,
                                'tag_id' => $tag->tag_id,
                            ];
                            $existingTagIds[] = $tag->tag_id; // Avoid duplicate inserts for same keepId
                        }
                    }
                }
            }

            // 4. Execute bulk operations
            if (!empty($allTagInserts)) {
                // Remove duplicates in allTagInserts (e.g. if multiple delete transactions had the same tag)
                $allTagInserts = collect($allTagInserts)->unique(fn($i) => $i['t_id'] . '-' . $i['tag_id'])->toArray();
                DB::table('fin_account_line_item_tag_map')->insertOrIgnore($allTagInserts);
                $totalTagsAdded = count($allTagInserts);
            }

            if (!empty($parentReassignments)) {
                // We update the links table, NOT the line items table
                // Any link where a deleted transaction was the parent should now point to the kept transaction
                $parentCaseSql = 'CASE ';
                foreach ($parentReassignments as $delId => $keepId) {
                    $parentCaseSql .= "WHEN parent_t_id = {$delId} THEN {$keepId} ";
                }
                $parentCaseSql .= 'ELSE parent_t_id END';

                DB::table('fin_account_line_item_links')
                    ->whereIn('parent_t_id', array_keys($parentReassignments))
                    ->update(['parent_t_id' => DB::raw($parentCaseSql)]);

                // Also handle cases where a deleted transaction was the child in a link
                $childCaseSql = 'CASE ';
                foreach ($parentReassignments as $delId => $keepId) {
                    $childCaseSql .= "WHEN child_t_id = {$delId} THEN {$keepId} ";
                }
                $childCaseSql .= 'ELSE child_t_id END';

                DB::table('fin_account_line_item_links')
                    ->whereIn('child_t_id', array_keys($parentReassignments))
                    ->update(['child_t_id' => DB::raw($childCaseSql)]);
            }

            if (!empty($actualDeleteIds)) {
                // Delete tag mappings first
                DB::table('fin_account_line_item_tag_map')
                    ->whereIn('t_id', $actualDeleteIds)
                    ->delete();

                // Delete the transactions
                $totalDeleted = FinAccountLineItems::whereIn('t_id', $actualDeleteIds)
                    ->where('t_account', $account->acct_id)
                    ->delete();
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'mergedCount' => $totalDeleted,
                'tagsAdded' => $totalTagsAdded,
                'markedAsNotDuplicate' => $totalMarkedAsNotDuplicate,
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
