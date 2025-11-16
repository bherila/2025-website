<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\ProductKey;

class LicenseKeyController extends Controller
{
    public function index(Request $request)
    {
        $productKeys = ProductKey::orderBy('product_name', 'asc')->get();

        return response()->json($productKeys);
    }

 

    public function store(Request $request)
    {
        $request->validate([
            'product_name' => 'required|string',
            'product_key' => 'required|string|unique:product_keys,product_key',
            'computer_name' => 'nullable|string',
            'comment' => 'nullable|string',
            'used_on' => 'nullable|string',
        ]);

        $data = $request->only(['product_name', 'product_key', 'computer_name', 'comment', 'used_on']);
        $data['uid'] = Auth::id();

        $productKey = ProductKey::create($data);

        return response()->json($productKey, 201);
    }

    /**
     * Import many product keys from a JSON array payload.
     * Expected payload: [{ productId, productKey, productName, computerName?, comment?, usedOn?, claimedDate?, keyType?, keyRetrievalNote? }, ...]
     */
    public function import(Request $request)
    {
        $items = $request->all();
        if (!is_array($items)) {
            return response()->json(['error' => 'Invalid payload, expected array'], 400);
        }

        $uid = Auth::id();
        $insertData = [];
        foreach ($items as $item) {
            if (!isset($item['productKey']) || !isset($item['productName'])) {
                continue;
            }
            $insertData[] = [
                'uid' => $uid,
                'product_id' => $item['productId'] ?? null,
                'product_key' => $item['productKey'],
                'product_name' => $item['productName'] ?? null,
                'computer_name' => $item['computerName'] ?? null,
                'comment' => $item['comment'] ?? null,
                'used_on' => $item['usedOn'] ?? null,
                'claimed_date' => $item['claimedDate'] ?? null,
                'key_type' => $item['keyType'] ?? null,
                'key_retrieval_note' => $item['keyRetrievalNote'] ?? null,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        if (count($insertData) === 0) {
            return response()->json(['error' => 'No valid product keys found'], 400);
        }

        // Use insert to create many rows. This bypasses Eloquent events but is fine here.
        \DB::table('product_keys')->insert($insertData);

        return response()->json(['success' => true]);
    }

    public function update(Request $request, $id)
    {
        $request->validate([
            'computer_name' => 'nullable|string',
            'comment' => 'nullable|string',
            'used_on' => 'nullable|string',
        ]);

        $productKey = ProductKey::findOrFail($id);

        $productKey->update([
            'computer_name' => $request->computer_name,
            'comment' => $request->comment,
            'used_on' => $request->used_on,
        ]);

        return response()->json($productKey);
    }

    public function destroy(Request $request, $id)
    {
        $productKey = ProductKey::findOrFail($id);
        $productKey->delete();

        return response()->json(['success' => true]);
    }
}