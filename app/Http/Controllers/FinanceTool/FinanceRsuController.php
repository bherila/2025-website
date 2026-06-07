<?php

namespace App\Http\Controllers\FinanceTool;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Http\Controllers\Controller;
use App\Http\Requests\FinanceTool\ConfirmRsuGenAiImportRequest;
use App\Models\FinanceTool\FinEquityAwards;
use App\Services\Finance\StockQuotes\StockQuoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class FinanceRsuController extends Controller
{
    private const GENAI_JOB_TYPE = 'equity_award';

    public function __construct(private readonly StockQuoteService $stockQuoteService) {}

    public function getRsuData(Request $request): JsonResponse
    {
        $user = Auth::user();
        $awards = FinEquityAwards::query()
            ->where('uid', $user->id)
            ->get();

        $this->stockQuoteService->ensureCoverageForAwards($awards);
        $closes = $this->stockQuoteService->closesForAwards($awards);

        $data = $awards->map(function ($item) use ($closes) {
            $fetchedVestPrice = $closes[$item->id] ?? null;
            if ($item->vest_price === null && $fetchedVestPrice !== null) {
                $item->vest_price = $fetchedVestPrice;
            }
            if ($item->vest_price === null) {
                unset($item->vest_price);
            }

            return $item;
        });

        return response()->json($data);
    }

    public function upsertRsuGrants(Request $request): JsonResponse
    {
        $user = Auth::user();
        $grants = $request->json()->all();

        foreach ($grants as $grant) {
            // Handle share_count which might be currency object or number
            $shareCount = isset($grant['share_count']['value'])
                ? $grant['share_count']['value']
                : $grant['share_count'];

            // If id is provided, update the specific record
            if (isset($grant['id'])) {
                DB::table('fin_equity_awards')
                    ->where('id', $grant['id'])
                    ->where('uid', $user->id) // Ensure user can only update their own records
                    ->update([
                        'award_id' => $grant['award_id'],
                        'grant_date' => $grant['grant_date'],
                        'vest_date' => $grant['vest_date'],
                        'symbol' => $grant['symbol'],
                        'share_count' => $shareCount,
                        'grant_price' => $grant['grant_price'] ?? null,
                        'vest_price' => $grant['vest_price'] ?? null,
                    ]);
            } else {
                // Otherwise use updateOrInsert based on unique key
                DB::table('fin_equity_awards')->updateOrInsert(
                    [
                        'uid' => $user->id,
                        'award_id' => $grant['award_id'],
                        'grant_date' => $grant['grant_date'],
                        'vest_date' => $grant['vest_date'],
                        'symbol' => $grant['symbol'],
                    ],
                    [
                        'share_count' => $shareCount,
                        'grant_price' => $grant['grant_price'] ?? null,
                        'vest_price' => $grant['vest_price'] ?? null,
                    ]
                );
            }
        }

        return response()->json(['status' => 'success']);
    }

    public function deleteRsuGrant(Request $request, int $id): JsonResponse
    {
        $user = Auth::user();

        $deleted = DB::table('fin_equity_awards')
            ->where('id', $id)
            ->where('uid', $user->id) // Ensure user can only delete their own records
            ->delete();

        if ($deleted) {
            return response()->json(['status' => 'success']);
        } else {
            return response()->json(['status' => 'error', 'message' => 'Record not found'], 404);
        }
    }

    public function confirmGenAiImport(ConfirmRsuGenAiImportRequest $request, int $jobId, int $resultId): JsonResponse
    {
        $user = Auth::user();

        $job = GenAiImportJob::query()
            ->where('id', $jobId)
            ->where('user_id', $user->id)
            ->where('job_type', self::GENAI_JOB_TYPE)
            ->firstOrFail();

        $result = GenAiImportResult::query()
            ->where('id', $resultId)
            ->where('job_id', $job->id)
            ->firstOrFail();

        if ($result->status === 'imported') {
            return response()->json(['error' => 'This result has already been imported.'], 409);
        }

        if ($result->status !== 'pending_review') {
            return response()->json(['error' => 'This result has already been reviewed.'], 409);
        }

        $award = DB::transaction(function () use ($request, $result, $job, $user): FinEquityAwards {
            $award = $this->upsertAwardFromImport((int) $user->id, $request->validated());

            $result->markImported();
            $this->maybeMarkJobImported($job);

            return $award;
        });

        return response()->json([
            'award' => $award->fresh(),
            'result' => $result->refresh(),
            'job_status' => $job->refresh()->status,
        ], 201);
    }

    public function skipGenAiImport(int $jobId, int $resultId): JsonResponse
    {
        $user = Auth::user();

        $job = GenAiImportJob::query()
            ->where('id', $jobId)
            ->where('user_id', $user->id)
            ->where('job_type', self::GENAI_JOB_TYPE)
            ->firstOrFail();

        $result = GenAiImportResult::query()
            ->where('id', $resultId)
            ->where('job_id', $job->id)
            ->firstOrFail();

        if ($result->status === 'imported') {
            return response()->json(['error' => 'This result has already been imported.'], 409);
        }

        if ($result->status !== 'pending_review') {
            return response()->json(['error' => 'This result has already been reviewed.'], 409);
        }

        $result->markSkipped();
        $this->maybeMarkJobImported($job);

        return response()->json([
            'result' => $result->refresh(),
            'job_status' => $job->refresh()->status,
        ]);
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function upsertAwardFromImport(int $userId, array $validated): FinEquityAwards
    {
        $identity = [
            'uid' => (string) $userId,
            'award_id' => (string) $validated['award_id'],
            'grant_date' => (string) $validated['grant_date'],
            'vest_date' => (string) $validated['vest_date'],
            'symbol' => (string) $validated['symbol'],
        ];

        $award = FinEquityAwards::query()->firstOrNew($identity);
        $award->share_count = (int) $validated['share_count'];

        if (array_key_exists('grant_price', $validated) && $validated['grant_price'] !== null) {
            $award->grant_price = $validated['grant_price'];
        }

        if (array_key_exists('vest_price', $validated) && $validated['vest_price'] !== null) {
            $award->vest_price = $validated['vest_price'];
        }

        $award->save();

        return $award;
    }

    private function maybeMarkJobImported(GenAiImportJob $job): void
    {
        $stillPending = $job->results()->where('status', 'pending_review')->exists();
        if (! $stillPending && $job->status !== 'imported') {
            $job->markImported();
        }
    }
}
