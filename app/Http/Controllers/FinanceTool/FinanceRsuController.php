<?php

namespace App\Http\Controllers\FinanceTool;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Http\Controllers\Controller;
use App\Http\Requests\FinanceTool\ConfirmRsuGenAiImportRequest;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinEquityAwards;
use App\Models\FinanceTool\FinPayslips;
use App\Models\FinanceTool\FinRsuLink;
use App\Models\FinanceTool\FinRsuVestSettlement;
use App\Services\Finance\Rsu\RsuAwardService;
use App\Services\Finance\Rsu\RsuSettlementService;
use App\Services\Finance\Rsu\RsuTaxProjectionService;
use App\Services\Finance\Rsu\RsuTransactionMatcher;
use App\Services\Finance\Rsu\RsuVestPriceBackfillService;
use App\Support\Access\FeatureAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class FinanceRsuController extends Controller
{
    private const GENAI_JOB_TYPE = 'equity_award';

    public function __construct(
        private readonly RsuAwardService $awardService,
        private readonly RsuVestPriceBackfillService $backfillService,
        private readonly RsuSettlementService $settlementService,
        private readonly RsuTransactionMatcher $matcher,
        private readonly RsuTaxProjectionService $taxProjectionService,
        private readonly FeatureAccess $featureAccess,
    ) {}

    public function getRsuData(Request $request): JsonResponse
    {
        $userId = (int) Auth::id();
        $this->backfillService->backfillMissingVestPrices($userId);

        $awards = FinEquityAwards::query()
            ->where('uid', $userId)
            ->with(['settlementAllocations.settlement', 'rsuLinks'])
            ->orderBy('vest_date')
            ->get();

        return response()->json($awards);
    }

    public function upsertRsuGrants(Request $request): JsonResponse
    {
        $payload = $request->json()->all();
        $grants = array_values(array_filter($payload, static fn (mixed $grant): bool => is_array($grant)));

        $awards = $this->awardService->upsertMany((int) Auth::id(), $grants, RsuAwardService::PRICE_SOURCE_MANUAL);

        return response()->json(['status' => 'success', 'awards' => $awards]);
    }

    public function deleteRsuGrant(Request $request, int $id): JsonResponse
    {
        if ($this->awardService->deleteForUser((int) Auth::id(), $id)) {
            return response()->json(['status' => 'success']);
        }

        return response()->json(['status' => 'error', 'message' => 'Record not found'], 404);
    }

    public function backfillVestPrices(): JsonResponse
    {
        return response()->json($this->backfillService->backfillMissingVestPrices((int) Auth::id()));
    }

    public function settlements(): JsonResponse
    {
        return response()->json(FinRsuVestSettlement::query()
            ->where('uid', Auth::id())
            ->with(['allocations.award', 'links'])
            ->orderByDesc('vest_date')
            ->get());
    }

    public function suggestSettlements(): JsonResponse
    {
        return response()->json($this->settlementService->suggest((int) Auth::id()));
    }

    public function confirmSettlement(Request $request, FinRsuVestSettlement $settlement): JsonResponse
    {
        $this->authorizeSettlement($settlement);
        $confirmed = $this->settlementService->confirm((int) Auth::id(), Carbon::parse($settlement->vest_date)->format('Y-m-d'), $settlement->symbol, ['settlement_id' => $settlement->id] + $request->all());

        return response()->json($confirmed->load(['allocations.award', 'links']));
    }

    public function updateSettlement(Request $request, FinRsuVestSettlement $settlement): JsonResponse
    {
        $this->authorizeSettlement($settlement);
        $confirmed = $this->settlementService->confirm((int) Auth::id(), Carbon::parse($settlement->vest_date)->format('Y-m-d'), $settlement->symbol, ['settlement_id' => $settlement->id] + $request->all());

        return response()->json($confirmed->load(['allocations.award', 'links']));
    }

    public function ignoreSettlement(FinRsuVestSettlement $settlement): JsonResponse
    {
        $this->authorizeSettlement($settlement);

        return response()->json($this->settlementService->ignore($settlement));
    }

    public function settlementLinks(FinRsuVestSettlement $settlement): JsonResponse
    {
        $this->authorizeSettlement($settlement);

        $links = $settlement->links()->with(['transaction', 'payslip'])->get();

        if (! $this->canReadTransactions()) {
            $links->each(static fn (FinRsuLink $link) => $link->unsetRelation('transaction'));
        }

        if (! $this->canReadPayslips()) {
            $links->each(static fn (FinRsuLink $link) => $link->unsetRelation('payslip'));
        }

        return response()->json($links);
    }

    public function settlementCandidates(FinRsuVestSettlement $settlement): JsonResponse
    {
        $this->authorizeSettlement($settlement);

        $candidates = $this->matcher->candidates($settlement);

        if (! $this->canReadTransactions()) {
            $candidates['transactions'] = [];
        }

        if (! $this->canReadPayslips()) {
            $candidates['payslips'] = [];
        }

        return response()->json($candidates);
    }

    private function canReadTransactions(): bool
    {
        $user = Auth::user();

        return $user !== null && $this->featureAccess->can($user, 'finance.transactions.view');
    }

    private function canReadPayslips(): bool
    {
        $user = Auth::user();

        return $user !== null && $this->featureAccess->can($user, 'finance.payslips.view');
    }

    public function createSettlementLink(Request $request, FinRsuVestSettlement $settlement): JsonResponse
    {
        $this->authorizeSettlement($settlement);
        $data = $request->validate([
            'settlement_allocation_id' => ['nullable', 'integer'],
            'equity_award_id' => ['nullable', 'integer'],
            'link_type' => ['required', 'string', Rule::in(FinRsuLink::LINK_TYPES)],
            'transaction_id' => ['nullable', 'integer'],
            'account_id' => ['nullable', 'integer'],
            'lot_id' => ['nullable', 'integer'],
            'payslip_id' => ['nullable', 'integer'],
            'confidence' => ['nullable', 'numeric', 'between:0,1'],
            'confidence_reasons' => ['nullable', 'array'],
            'status' => ['sometimes', 'string', Rule::in(['suggested', 'confirmed', 'ignored'])],
            'notes' => ['nullable', 'string'],
        ]);
        $this->settlementService->assertLinkTargetsBelongToSettlement((int) Auth::id(), $settlement, $data);

        $link = FinRsuLink::query()->create($data + [
            'uid' => Auth::id(),
            'settlement_id' => $settlement->id,
            'status' => $data['status'] ?? 'suggested',
        ]);

        return response()->json($link, 201);
    }

    public function deleteRsuLink(FinRsuLink $link): JsonResponse
    {
        if ((int) $link->uid !== (int) Auth::id()) {
            abort(404);
        }
        $link->delete();

        return response()->json(['status' => 'success']);
    }

    public function transactionRsuLinks(int $transaction): JsonResponse
    {
        $lineItem = FinAccountLineItems::query()
            ->where('t_id', $transaction)
            ->whereHas('account', fn ($query) => $query->withoutGlobalScopes()->where('acct_owner', Auth::id()))
            ->firstOrFail();

        return response()->json(FinRsuLink::query()->where('transaction_id', $lineItem->t_id)->with('settlement')->get());
    }

    public function payslipRsuLinks(int $payslip): JsonResponse
    {
        $row = FinPayslips::query()->where('uid', Auth::id())->where('payslip_id', $payslip)->firstOrFail();

        return response()->json(FinRsuLink::query()->where('payslip_id', $row->payslip_id)->with('settlement')->get());
    }

    public function taxProjection(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);

        return response()->json($this->taxProjectionService->facts((int) Auth::id(), $year));
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
            $award = $this->awardService->upsert((int) $user->id, $request->validated(), RsuAwardService::PRICE_SOURCE_IMPORTED);

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

    private function maybeMarkJobImported(GenAiImportJob $job): void
    {
        $stillPending = $job->results()->where('status', 'pending_review')->exists();
        if (! $stillPending && $job->status !== 'imported') {
            $job->markImported();
        }
    }

    private function authorizeSettlement(FinRsuVestSettlement $settlement): void
    {
        if ((int) $settlement->uid !== (int) Auth::id()) {
            abort(404);
        }
    }
}
