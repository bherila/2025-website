<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinAccountLineItemTagMap;
use App\Models\FinanceTool\FinAccountTag;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class FinanceTransactionTaggingApiController extends Controller
{
    public function getUserTags(Request $request)
    {
        $uid = Auth::id();

        $tags = FinAccountTag::where('tag_userid', $uid)
            ->whereNull('when_deleted')
            ->get(['tag_id', 'tag_label', 'tag_color']);

        $includeCounts = $request->get('include_counts') === 'true';
        $includeTotals = $request->get('totals') === 'true';

        if ($includeCounts || $includeTotals) {
            $tags = $tags->map(function ($tag) use ($includeCounts, $includeTotals) {
                // Fetch active transaction IDs once (shared by counts and totals)
                $tIds = FinAccountLineItemTagMap::where('tag_id', $tag->tag_id)
                    ->whereNull('when_deleted')
                    ->pluck('t_id');

                if ($includeCounts) {
                    $tag->transaction_count = $tIds->count();
                }

                if ($includeTotals) {
                    $yearlyTotals = \App\Models\FinanceTool\FinAccountLineItems::whereIn('t_id', $tIds)
                        ->selectRaw("SUBSTR(t_date, 1, 4) as year, SUM(CAST(t_amt AS NUMERIC)) as total")
                        ->groupBy('year')
                        ->orderBy('year')
                        ->get()
                        ->pluck('total', 'year')
                        ->map(fn($v) => (float) $v)
                        ->toArray();

                    // Add an 'all' entry for the sum across all years
                    $yearlyTotals['all'] = array_sum($yearlyTotals);
                    $tag->totals = $yearlyTotals;
                }

                return $tag;
            });
        }

        return response()->json([
            'data' => $tags->values(),
        ]);
    }

    public function createTag(Request $request)
    {
        $uid = Auth::id();

        $request->validate([
            'tag_label' => 'required|string|max:50',
            'tag_color' => 'required|string|max:20',
        ]);

        // Check for duplicate tag label for this user
        $existingTag = FinAccountTag::where('tag_userid', $uid)
            ->where('tag_label', $request->tag_label)
            ->whereNull('when_deleted')
            ->first();

        if ($existingTag) {
            return response()->json(['error' => 'A tag with this name already exists'], 400);
        }

        $tag = FinAccountTag::create([
            'tag_userid' => $uid,
            'tag_label' => $request->tag_label,
            'tag_color' => $request->tag_color,
        ]);

        return response()->json([
            'success' => true,
            'tag_id' => $tag->tag_id,
        ]);
    }

    public function updateTag(Request $request, $tag_id)
    {
        $uid = Auth::id();

        $request->validate([
            'tag_label' => 'required|string|max:50',
            'tag_color' => 'required|string|max:20',
        ]);

        $tag = FinAccountTag::where('tag_id', $tag_id)
            ->where('tag_userid', $uid)
            ->whereNull('when_deleted')
            ->firstOrFail();

        // Check for duplicate tag label (excluding current tag)
        $existingTag = FinAccountTag::where('tag_userid', $uid)
            ->where('tag_label', $request->tag_label)
            ->where('tag_id', '!=', $tag_id)
            ->whereNull('when_deleted')
            ->first();

        if ($existingTag) {
            return response()->json(['error' => 'A tag with this name already exists'], 400);
        }

        $tag->update([
            'tag_label' => $request->tag_label,
            'tag_color' => $request->tag_color,
        ]);

        return response()->json(['success' => true]);
    }

    public function deleteTag(Request $request, $tag_id)
    {
        $uid = Auth::id();

        $tag = FinAccountTag::where('tag_id', $tag_id)
            ->where('tag_userid', $uid)
            ->whereNull('when_deleted')
            ->firstOrFail();

        // Soft delete the tag
        $tag->update(['when_deleted' => now()]);

        // Also soft delete all tag mappings
        FinAccountLineItemTagMap::where('tag_id', $tag_id)
            ->update(['when_deleted' => now()]);

        return response()->json(['success' => true]);
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
            ->first();

        if (!$tag) {
            \Illuminate\Support\Facades\Log::warning('Tag not found for user', [
                'uid' => $uid,
                'tag_id' => $request->tag_id,
            ]);
            return response()->json(['error' => 'Tag not found'], 404);
        }

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
}
