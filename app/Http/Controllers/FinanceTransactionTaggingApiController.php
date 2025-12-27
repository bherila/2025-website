<?php

namespace App\Http\Controllers;

use App\Models\FinAccountLineItemTagMap;
use App\Models\FinAccountTag;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class FinanceTransactionTaggingApiController extends Controller
{
    public function getUserTags(Request $request)
    {
        $uid = Auth::id();

        $query = FinAccountTag::where('tag_userid', $uid)
            ->whereNull('when_deleted');

        // Include transaction counts if requested
        if ($request->get('include_counts') === 'true') {
            $tags = $query->get(['tag_id', 'tag_label', 'tag_color']);

            // Get counts for each tag
            $tags = $tags->map(function ($tag) {
                $tag->transaction_count = FinAccountLineItemTagMap::where('tag_id', $tag->tag_id)
                    ->whereNull('when_deleted')
                    ->count();

                return $tag;
            });

            return response()->json($tags);
        }

        $tags = $query->get(['tag_id', 'tag_label', 'tag_color']);

        return response()->json($tags);
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
}
