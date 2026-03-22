<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class FinanceTransactionsDedupeApiController extends Controller
{
    /**
     * Find duplicate transactions in an account
     * Duplicates are detected by: same date + qty + amount + symbol
     * Also checks if description/memo are identical or swapped
     *
     * Transaction pairs registered in fin_transaction_non_duplicate_pairs are excluded.
     *
     * Note: We prefer to keep the transaction with the most information (non-null fields).
     * If equally detailed, we prefer the newer t_id (highest).
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

        // Count how many transaction pairs were already confirmed as non-duplicates (for UI info)
        $previouslyMarkedCount = DB::table('fin_transaction_non_duplicate_pairs')
            ->join('fin_account_line_items as t1', 'fin_transaction_non_duplicate_pairs.t_id_1', '=', 't1.t_id')
            ->where('t1.t_account', $account->acct_id)
            ->count();

        // Step 1: Identify candidate duplicate groups using SQL GROUP BY
        // We omit t_account_balance to catch duplicates imported with different running balances
        $candidateQuery = FinAccountLineItems::where('t_account', $account->acct_id)
            ->whereNull('when_deleted')
            ->select('t_date', 't_qty', 't_amt', 't_symbol')
            ->groupBy('t_date', 't_qty', 't_amt', 't_symbol')
            ->havingRaw('COUNT(*) > 1');

        if ($year) {
            $candidateQuery->whereYear('t_date', $year);
        }

        $candidates = $candidateQuery->get();

        if ($candidates->isEmpty()) {
            return response()->json([
                'groups' => [],
                'total' => 0,
                'previouslyMarkedCount' => $previouslyMarkedCount,
            ]);
        }

        // Step 2: Fetch all transactions that match the candidate criteria
        $query = FinAccountLineItems::where('t_account', $account->acct_id)
            ->whereNull('when_deleted')
            ->with(['tags', 'parentTransactions:t_id']);

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

        // Load all confirmed non-duplicate pairs for these transactions so we can filter in PHP
        $transactionIds = $transactions->pluck('t_id')->toArray();
        $knownNonDuplicatePairs = [];
        if (! empty($transactionIds)) {
            $pairs = DB::table('fin_transaction_non_duplicate_pairs')
                ->where(function ($q) use ($transactionIds) {
                    $q->whereIn('t_id_1', $transactionIds)
                        ->orWhereIn('t_id_2', $transactionIds);
                })
                ->get();
            foreach ($pairs as $pair) {
                $key = min($pair->t_id_1, $pair->t_id_2).'_'.max($pair->t_id_1, $pair->t_id_2);
                $knownNonDuplicatePairs[$key] = true;
            }
        }

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

                // Filter out pairs that are already confirmed as non-duplicates
                $filteredGroup = $this->filterKnownNonDuplicates($allInGroup, $knownNonDuplicatePairs);
                if ($filteredGroup->count() < 2) {
                    continue;
                }

                $keepTransaction = $filteredGroup->sort(function ($a, $b) {
                    // Prefer transaction with more information
                    $scoreA = $this->informationScore($a);
                    $scoreB = $this->informationScore($b);
                    if ($scoreA !== $scoreB) {
                        return $scoreA <=> $scoreB;
                    }

                    // Fallback to ID (prefer newer)
                    return $a->t_id <=> $b->t_id;
                })->last();

                $deleteIds = $filteredGroup->filter(fn ($t) => $t->t_id !== $keepTransaction->t_id)->pluck('t_id')->toArray();

                $groups[] = [
                    'key' => $key,
                    'transactions' => $filteredGroup->map(function ($t) {
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
                            'tags' => $t->tags->map(fn ($tag) => [
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

        return response()->json([
            'groups' => $groups,
            'total' => count($groups),
            'previouslyMarkedCount' => $previouslyMarkedCount,
        ]);
    }

    /**
     * Merge duplicate transactions (bulk operation)
     * - Combines tags from all transactions onto the kept transaction
     * - Reassigns parent_t_id from deleted transactions to kept transaction
     * - Deletes the specified transactions
     * - Records confirmed non-duplicate pairs in fin_transaction_non_duplicate_pairs
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
            'markAsNotDuplicatePairs' => 'sometimes|array',
            'markAsNotDuplicatePairs.*' => 'array',
            'markAsNotDuplicatePairs.*.t_id_1' => 'required|integer',
            'markAsNotDuplicatePairs.*.t_id_2' => 'required|integer',
        ]);

        $merges = $request->merges ?? [];
        $markAsNotDuplicatePairs = $request->markAsNotDuplicatePairs ?? [];
        $totalDeleted = 0;
        $totalTagsAdded = 0;
        $totalMarkedAsNotDuplicate = 0;

        DB::beginTransaction();
        try {
            // Record confirmed non-duplicate pairs
            if (! empty($markAsNotDuplicatePairs)) {
                // Verify all transaction IDs belong to this account
                $allPairIds = [];
                foreach ($markAsNotDuplicatePairs as $pair) {
                    $allPairIds[] = $pair['t_id_1'];
                    $allPairIds[] = $pair['t_id_2'];
                }
                $allPairIds = array_unique($allPairIds);

                $validIds = FinAccountLineItems::whereIn('t_id', $allPairIds)
                    ->where('t_account', $account->acct_id)
                    ->pluck('t_id')
                    ->toArray();
                $validIdsSet = array_flip($validIds);

                $pairsToInsert = [];
                foreach ($markAsNotDuplicatePairs as $pair) {
                    $id1 = $pair['t_id_1'];
                    $id2 = $pair['t_id_2'];
                    if (isset($validIdsSet[$id1]) && isset($validIdsSet[$id2]) && $id1 !== $id2) {
                        // Always store with smaller ID first for consistent lookup
                        $pairsToInsert[] = [
                            't_id_1' => min($id1, $id2),
                            't_id_2' => max($id1, $id2),
                            'created_at' => now(),
                        ];
                    }
                }

                if (! empty($pairsToInsert)) {
                    // Deduplicate before inserting
                    $pairsToInsert = collect($pairsToInsert)
                        ->unique(fn ($p) => $p['t_id_1'].'-'.$p['t_id_2'])
                        ->toArray();
                    DB::table('fin_transaction_non_duplicate_pairs')->insertOrIgnore($pairsToInsert);
                    $totalMarkedAsNotDuplicate = count($pairsToInsert);
                }
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

                if (! $allRelevantTransactions->has($keepId)) {
                    continue;
                }

                $keepTransaction = $allRelevantTransactions->get($keepId);
                $existingTagIds = $keepTransaction->tags->pluck('tag_id')->toArray();

                foreach ($deleteIds as $delId) {
                    if (! $allRelevantTransactions->has($delId)) {
                        continue;
                    }

                    $delTransaction = $allRelevantTransactions->get($delId);
                    $actualDeleteIds[] = $delId;
                    $parentReassignments[$delId] = $keepId;

                    foreach ($delTransaction->tags as $tag) {
                        if (! in_array($tag->tag_id, $existingTagIds)) {
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
            if (! empty($allTagInserts)) {
                // Remove duplicates in allTagInserts (e.g. if multiple delete transactions had the same tag)
                $allTagInserts = collect($allTagInserts)->unique(fn ($i) => $i['t_id'].'-'.$i['tag_id'])->toArray();
                DB::table('fin_account_line_item_tag_map')->insertOrIgnore($allTagInserts);
                $totalTagsAdded = count($allTagInserts);
            }

            if (! empty($parentReassignments)) {
                // Re-map links involving deleted transactions to the kept transactions.
                // We fetch all affected links, compute the new (parent, child) pairs, then
                // delete the old links and insert the new ones using insertOrIgnore to avoid
                // UNIQUE constraint violations when multiple deleted transactions shared a link
                // or when the kept transaction already had an equivalent link.
                $deletedIds = array_keys($parentReassignments);

                $affectedLinks = DB::table('fin_account_line_item_links')
                    ->where(function ($q) use ($deletedIds) {
                        $q->whereIn('parent_t_id', $deletedIds)
                            ->orWhereIn('child_t_id', $deletedIds);
                    })
                    ->get();

                $newLinks = [];
                foreach ($affectedLinks as $link) {
                    $newParent = $parentReassignments[$link->parent_t_id] ?? $link->parent_t_id;
                    $newChild = $parentReassignments[$link->child_t_id] ?? $link->child_t_id;
                    // Skip self-referential links that arise when both sides map to the same keeper
                    if ($newParent === $newChild) {
                        continue;
                    }
                    $newLinks[] = [
                        'parent_t_id' => $newParent,
                        'child_t_id' => $newChild,
                    ];
                }

                // Remove the old links first, then insert the de-duplicated replacements
                DB::table('fin_account_line_item_links')
                    ->where(function ($q) use ($deletedIds) {
                        $q->whereIn('parent_t_id', $deletedIds)
                            ->orWhereIn('child_t_id', $deletedIds);
                    })
                    ->delete();

                if (! empty($newLinks)) {
                    // Deduplicate in PHP before inserting (multiple old links can collapse to the same pair)
                    $uniqueLinks = collect($newLinks)
                        ->unique(fn ($l) => $l['parent_t_id'].'-'.$l['child_t_id'])
                        ->toArray();
                    DB::table('fin_account_line_item_links')->insertOrIgnore($uniqueLinks);
                }
            }

            if (! empty($actualDeleteIds)) {
                // Reassign lots from deleted transactions to kept transactions
                foreach ($parentReassignments as $delId => $keepId) {
                    FinAccountLot::where('open_t_id', $delId)->update(['open_t_id' => $keepId]);
                    FinAccountLot::where('close_t_id', $delId)->update(['close_t_id' => $keepId]);
                }

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

            return response()->json(['error' => 'Failed to merge transactions: '.$e->getMessage()], 500);
        }
    }

    /**
     * Count the number of non-null, non-empty information fields in a transaction.
     * Used to prefer keeping the transaction with more data when deduplicating.
     * Tags and other JOIN-requiring fields are excluded.
     */
    private function informationScore($transaction): int
    {
        $score = 0;
        $fields = ['t_type', 't_description', 't_symbol', 't_qty', 't_price', 't_comment'];
        foreach ($fields as $field) {
            $val = $transaction->$field;
            if ($val !== null && $val !== '' && $val !== 0 && $val !== '0' && $val !== 0.0) {
                $score++;
            }
        }

        return $score;
    }

    /**
     * Filter a group of transactions by removing transactions whose all pairwise
     * combinations are already in the confirmed non-duplicate pairs set.
     * Returns the transactions that still form potential duplicate pairs.
     */
    private function filterKnownNonDuplicates($group, array $knownNonDuplicatePairs)
    {
        $ids = $group->pluck('t_id')->toArray();
        $count = count($ids);

        if ($count < 2) {
            return $group;
        }

        // Find transactions that still have at least one unconfirmed pair
        $keepInGroup = [];
        for ($i = 0; $i < $count; $i++) {
            for ($j = $i + 1; $j < $count; $j++) {
                $pairKey = min($ids[$i], $ids[$j]).'_'.max($ids[$i], $ids[$j]);
                if (! isset($knownNonDuplicatePairs[$pairKey])) {
                    // This pair is not confirmed as non-duplicate - keep both
                    $keepInGroup[$ids[$i]] = true;
                    $keepInGroup[$ids[$j]] = true;
                }
            }
        }

        return $group->filter(fn ($t) => isset($keepInGroup[$t->t_id]))->values();
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
