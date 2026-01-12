<?php

namespace App\Http\Controllers\UtilityBillTracker;

use App\Http\Controllers\Controller;
use App\Models\UtilityBillTracker\UtilityAccount;
use App\Models\UtilityBillTracker\UtilityBill;
use App\Services\FileStorageService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class UtilityBillApiController extends Controller
{
    protected FileStorageService $fileService;

    public function __construct(FileStorageService $fileService)
    {
        $this->fileService = $fileService;
    }

    /**
     * Get all bills for a utility account.
     */
    public function index(int $accountId)
    {
        $account = UtilityAccount::findOrFail($accountId);

        $bills = UtilityBill::where('utility_account_id', $accountId)
            ->with('linkedTransaction:t_id,t_description,t_amt,t_date')
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
            'taxes' => 'nullable|numeric|min:0',
            'fees' => 'nullable|numeric|min:0',
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
            'taxes' => $request->taxes,
            'fees' => $request->fees,
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
            ->with('linkedTransaction:t_id,t_description,t_amt,t_date')
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
            'taxes' => 'nullable|numeric|min:0',
            'fees' => 'nullable|numeric|min:0',
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
            'taxes' => $request->taxes,
            'fees' => $request->fees,
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
     * Toggle bill status between Paid and Unpaid.
     */
    public function toggleStatus(int $accountId, int $billId)
    {
        UtilityAccount::findOrFail($accountId);

        $bill = UtilityBill::where('utility_account_id', $accountId)
            ->where('id', $billId)
            ->firstOrFail();

        $bill->update([
            'status' => $bill->status === 'Paid' ? 'Unpaid' : 'Paid',
        ]);

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

        // The model's deleting event will handle S3 file deletion
        $bill->delete();

        return response()->json(['message' => 'Bill deleted successfully']);
    }

    /**
     * Download the PDF file for a bill.
     */
    public function downloadPdf(int $accountId, int $billId)
    {
        UtilityAccount::findOrFail($accountId);

        $bill = UtilityBill::where('utility_account_id', $accountId)
            ->where('id', $billId)
            ->firstOrFail();

        if (!$bill->pdf_s3_path) {
            return response()->json(['error' => 'No PDF file attached to this bill'], 404);
        }

        $downloadUrl = $this->fileService->getSignedDownloadUrl(
            $bill->pdf_s3_path,
            $bill->pdf_original_filename ?? 'bill.pdf',
            15
        );

        return response()->json(['download_url' => $downloadUrl]);
    }

    /**
     * Delete the PDF file for a bill.
     */
    public function deletePdf(int $accountId, int $billId)
    {
        UtilityAccount::findOrFail($accountId);

        $bill = UtilityBill::where('utility_account_id', $accountId)
            ->where('id', $billId)
            ->firstOrFail();

        if (!$bill->pdf_s3_path) {
            return response()->json(['error' => 'No PDF file attached to this bill'], 404);
        }

        // Delete from S3
        $this->fileService->deleteFile($bill->pdf_s3_path);

        // Clear the file columns
        $bill->update([
            'pdf_original_filename' => null,
            'pdf_stored_filename' => null,
            'pdf_s3_path' => null,
            'pdf_file_size_bytes' => null,
        ]);

        return response()->json(['message' => 'PDF deleted successfully']);
    }
}
