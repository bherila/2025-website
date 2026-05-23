<?php

namespace App\Http\Controllers\UtilityBillTracker;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Http\Controllers\Controller;
use App\Models\UtilityBillTracker\UtilityAccount;
use App\Models\UtilityBillTracker\UtilityBill;
use App\Services\FileStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Throwable;

/**
 * Persist GenAI-parsed utility-bill results into the utility_bill table.
 *
 * The upload + parse path itself lives in the shared GenAi import pipeline
 * (see app/GenAiProcessor + docs/genai-import.md). This controller only owns
 * the per-feature confirm/skip step that turns a reviewed GenAiImportResult
 * into a UtilityBill row.
 */
class UtilityBillImportController extends Controller
{
    public function __construct(
        private FileStorageService $fileService,
    ) {}

    /**
     * Confirm a parsed result and create the matching UtilityBill row.
     * POST /api/utility-bill-tracker/accounts/{accountId}/bills/genai-import/{jobId}/results/{resultId}/confirm
     */
    public function confirm(Request $request, int $accountId, int $jobId, int $resultId): JsonResponse
    {
        $user = Auth::user();
        $account = UtilityAccount::findOrFail($accountId);

        $job = GenAiImportJob::query()
            ->where('id', $jobId)
            ->where('user_id', $user->id)
            ->where('job_type', 'utility_bill')
            ->firstOrFail();

        $context = $job->getContextArray();
        $contextAccountId = (int) ($context['utility_account_id'] ?? 0);
        if ($contextAccountId !== $accountId) {
            return response()->json(['error' => 'Job does not belong to this utility account.'], 403);
        }

        $result = GenAiImportResult::query()
            ->where('id', $resultId)
            ->where('job_id', $job->id)
            ->firstOrFail();

        if ($result->status === 'imported') {
            return response()->json(['error' => 'This result has already been imported.'], 409);
        }

        $rules = [
            'bill_start_date' => 'required|date',
            'bill_end_date' => 'required|date|after_or_equal:bill_start_date',
            'due_date' => 'required|date',
            'total_cost' => 'required|numeric|min:0',
            'status' => 'required|in:Paid,Unpaid',
            'notes' => 'nullable|string',
            'taxes' => 'nullable|numeric|min:0',
            'fees' => 'nullable|numeric|min:0',
            'discounts' => 'nullable|numeric|min:0',
            'credits' => 'nullable|numeric|min:0',
            'payments_received' => 'nullable|numeric|min:0',
            'previous_unpaid_balance' => 'nullable|numeric|min:0',
        ];

        if ($account->account_type === 'Electricity') {
            $rules['power_consumed_kwh'] = 'nullable|numeric|min:0';
            $rules['total_generation_fees'] = 'nullable|numeric|min:0';
            $rules['total_delivery_fees'] = 'nullable|numeric|min:0';
        }

        $validator = Validator::make($request->all(), $rules);
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $billData = [
            'utility_account_id' => $accountId,
            'bill_start_date' => $request->input('bill_start_date'),
            'bill_end_date' => $request->input('bill_end_date'),
            'due_date' => $request->input('due_date'),
            'total_cost' => $request->input('total_cost'),
            'status' => $request->input('status'),
            'notes' => $request->input('notes'),
            'taxes' => $request->input('taxes'),
            'fees' => $request->input('fees'),
            'discounts' => $request->input('discounts'),
            'credits' => $request->input('credits'),
            'payments_received' => $request->input('payments_received'),
            'previous_unpaid_balance' => $request->input('previous_unpaid_balance'),
        ];

        if ($account->account_type === 'Electricity') {
            $billData['power_consumed_kwh'] = $request->input('power_consumed_kwh');
            $billData['total_generation_fees'] = $request->input('total_generation_fees');
            $billData['total_delivery_fees'] = $request->input('total_delivery_fees');
        }

        // Copy the PDF from the genai-import staging path into the canonical utility-bills
        // location so the bill's pdf_s3_path is independent of the import job's lifecycle.
        $copied = $this->copyStagedPdfToBillStorage($job, $accountId);
        if ($copied !== null) {
            $billData['pdf_original_filename'] = $job->original_filename;
            $billData['pdf_stored_filename'] = $copied['stored_filename'];
            $billData['pdf_s3_path'] = $copied['s3_path'];
            $billData['pdf_file_size_bytes'] = $job->file_size_bytes;
        }

        $bill = UtilityBill::create($billData);

        $result->markImported();
        $this->maybeMarkJobImported($job);

        return response()->json([
            'bill' => $bill->load('linkedTransaction:t_id,t_description,t_amt,t_date'),
            'result' => $result->refresh(),
            'job_status' => $job->refresh()->status,
        ], 201);
    }

    /**
     * Skip a parsed result without creating a bill.
     * POST /api/utility-bill-tracker/accounts/{accountId}/bills/genai-import/{jobId}/results/{resultId}/skip
     */
    public function skip(int $accountId, int $jobId, int $resultId): JsonResponse
    {
        $user = Auth::user();
        UtilityAccount::findOrFail($accountId);

        $job = GenAiImportJob::query()
            ->where('id', $jobId)
            ->where('user_id', $user->id)
            ->where('job_type', 'utility_bill')
            ->firstOrFail();

        $context = $job->getContextArray();
        $contextAccountId = (int) ($context['utility_account_id'] ?? 0);
        if ($contextAccountId !== $accountId) {
            return response()->json(['error' => 'Job does not belong to this utility account.'], 403);
        }

        $result = GenAiImportResult::query()
            ->where('id', $resultId)
            ->where('job_id', $job->id)
            ->firstOrFail();

        if ($result->status === 'imported') {
            return response()->json(['error' => 'This result has already been imported.'], 409);
        }

        $result->markSkipped();
        $this->maybeMarkJobImported($job);

        return response()->json([
            'result' => $result->refresh(),
            'job_status' => $job->refresh()->status,
        ]);
    }

    /**
     * @return array{stored_filename: string, s3_path: string}|null
     */
    private function copyStagedPdfToBillStorage(GenAiImportJob $job, int $accountId): ?array
    {
        if (empty($job->s3_path)) {
            return null;
        }

        try {
            $disk = Storage::disk('s3');
            if (! $disk->exists($job->s3_path)) {
                return null;
            }

            $storedFilename = UtilityBill::generateStoredFilename($job->original_filename ?: 'bill.pdf');
            $billS3Path = UtilityBill::generateS3Path($accountId, $storedFilename);

            $contents = $disk->get($job->s3_path);
            if ($contents === null || ! $this->fileService->uploadContent($contents, $billS3Path)) {
                return null;
            }

            return ['stored_filename' => $storedFilename, 's3_path' => $billS3Path];
        } catch (Throwable $e) {
            Log::warning('Failed to copy staged PDF for utility bill import', [
                'job_id' => $job->id,
                'staged_path' => $job->s3_path,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    private function maybeMarkJobImported(GenAiImportJob $job): void
    {
        $stillPending = $job->results()->where('status', 'pending_review')->exists();
        if (! $stillPending && $job->status !== 'imported') {
            $job->markImported();
        }
    }
}
