<?php

namespace App\Http\Controllers\UtilityBillTracker;

use App\Http\Controllers\Controller;
use App\Models\UtilityBillTracker\UtilityAccount;
use App\Models\UtilityBillTracker\UtilityBill;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class UtilityBillApiController extends Controller
{
    /**
     * Get all bills for a utility account.
     */
    public function index(int $accountId)
    {
        $account = UtilityAccount::findOrFail($accountId);

        $bills = UtilityBill::where('utility_account_id', $accountId)
            ->orderBy('due_date', 'desc')
            ->get();

        return response()->json($bills);
    }

    /**
     * Create a new utility bill.
     */
    public function store(Request $request, int $accountId)
    {
        $account = UtilityAccount::findOrFail($accountId);

        $rules = [
            'bill_start_date' => 'required|date',
            'bill_end_date' => 'required|date|after_or_equal:bill_start_date',
            'due_date' => 'required|date',
            'total_cost' => 'required|numeric|min:0',
            'status' => 'required|in:Paid,Unpaid',
            'notes' => 'nullable|string',
        ];

        // Add electricity-specific validation if account type is Electricity
        if ($account->account_type === 'Electricity') {
            $rules['power_consumed_kwh'] = 'nullable|numeric|min:0';
            $rules['total_generation_fees'] = 'nullable|numeric|min:0';
            $rules['total_delivery_fees'] = 'nullable|numeric|min:0';
        }

        $validator = Validator::make($request->all(), $rules);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = [
            'utility_account_id' => $accountId,
            'bill_start_date' => $request->bill_start_date,
            'bill_end_date' => $request->bill_end_date,
            'due_date' => $request->due_date,
            'total_cost' => $request->total_cost,
            'status' => $request->status,
            'notes' => $request->notes,
        ];

        // Include electricity-specific fields if account type is Electricity
        if ($account->account_type === 'Electricity') {
            $data['power_consumed_kwh'] = $request->power_consumed_kwh;
            $data['total_generation_fees'] = $request->total_generation_fees;
            $data['total_delivery_fees'] = $request->total_delivery_fees;
        }

        $bill = UtilityBill::create($data);

        return response()->json($bill, 201);
    }

    /**
     * Get a specific utility bill.
     */
    public function show(int $accountId, int $billId)
    {
        $account = UtilityAccount::findOrFail($accountId);

        $bill = UtilityBill::where('utility_account_id', $accountId)
            ->where('id', $billId)
            ->firstOrFail();

        return response()->json($bill);
    }

    /**
     * Update a utility bill.
     */
    public function update(Request $request, int $accountId, int $billId)
    {
        $account = UtilityAccount::findOrFail($accountId);

        $bill = UtilityBill::where('utility_account_id', $accountId)
            ->where('id', $billId)
            ->firstOrFail();

        $rules = [
            'bill_start_date' => 'required|date',
            'bill_end_date' => 'required|date|after_or_equal:bill_start_date',
            'due_date' => 'required|date',
            'total_cost' => 'required|numeric|min:0',
            'status' => 'required|in:Paid,Unpaid',
            'notes' => 'nullable|string',
        ];

        // Add electricity-specific validation if account type is Electricity
        if ($account->account_type === 'Electricity') {
            $rules['power_consumed_kwh'] = 'nullable|numeric|min:0';
            $rules['total_generation_fees'] = 'nullable|numeric|min:0';
            $rules['total_delivery_fees'] = 'nullable|numeric|min:0';
        }

        $validator = Validator::make($request->all(), $rules);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = [
            'bill_start_date' => $request->bill_start_date,
            'bill_end_date' => $request->bill_end_date,
            'due_date' => $request->due_date,
            'total_cost' => $request->total_cost,
            'status' => $request->status,
            'notes' => $request->notes,
        ];

        // Include electricity-specific fields if account type is Electricity
        if ($account->account_type === 'Electricity') {
            $data['power_consumed_kwh'] = $request->power_consumed_kwh;
            $data['total_generation_fees'] = $request->total_generation_fees;
            $data['total_delivery_fees'] = $request->total_delivery_fees;
        }

        $bill->update($data);

        return response()->json($bill);
    }

    /**
     * Delete a utility bill.
     */
    public function destroy(int $accountId, int $billId)
    {
        UtilityAccount::findOrFail($accountId);

        $bill = UtilityBill::where('utility_account_id', $accountId)
            ->where('id', $billId)
            ->firstOrFail();

        $bill->delete();

        return response()->json(['message' => 'Bill deleted successfully']);
    }
}
