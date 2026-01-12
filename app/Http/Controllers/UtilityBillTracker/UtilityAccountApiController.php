<?php

namespace App\Http\Controllers\UtilityBillTracker;

use App\Http\Controllers\Controller;
use App\Models\UtilityBillTracker\UtilityAccount;
use App\Models\UtilityBillTracker\UtilityBill;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class UtilityAccountApiController extends Controller
{
    /**
     * Get all utility accounts for the authenticated user.
     */
    public function index()
    {
        $accounts = UtilityAccount::withCount('bills')
            ->withSum('bills', 'total_cost')
            ->orderBy('account_name')
            ->get();

        return response()->json($accounts);
    }

    /**
     * Create a new utility account.
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'account_name' => 'required|string|max:255',
            'account_type' => 'required|in:Electricity,General',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $account = UtilityAccount::create([
            'account_name' => $request->account_name,
            'account_type' => $request->account_type,
        ]);

        return response()->json($account, 201);
    }

    /**
     * Get a specific utility account.
     */
    public function show(int $id)
    {
        $account = UtilityAccount::withCount('bills')->findOrFail($id);

        return response()->json($account);
    }

    /**
     * Update utility account notes.
     */
    public function updateNotes(Request $request, int $id)
    {
        $validator = Validator::make($request->all(), [
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $account = UtilityAccount::findOrFail($id);
        $account->update(['notes' => $request->notes]);

        return response()->json($account);
    }

    /**
     * Delete a utility account (only if it has no bills).
     */
    public function destroy(int $id)
    {
        $account = UtilityAccount::withCount('bills')->findOrFail($id);

        if ($account->bills_count > 0) {
            return response()->json([
                'error' => 'Cannot delete account with existing bills. Delete all bills first.',
            ], 422);
        }

        $account->delete();

        return response()->json(['message' => 'Account deleted successfully']);
    }
}
