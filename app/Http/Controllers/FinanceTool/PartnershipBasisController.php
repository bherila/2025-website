<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPartnershipBasisEvent;
use App\Services\Finance\PartnershipBasisService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class PartnershipBasisController extends Controller
{
    public function __construct(private readonly PartnershipBasisService $partnershipBasisService) {}

    public function show(Request $request, int $account): JsonResponse
    {
        $year = $this->year($request);
        $financeAccount = $this->account($account);
        $this->partnershipBasisService->recomputeForUserYear((int) Auth::id(), $year);

        return response()->json($this->partnershipBasisService->accountBasisData($financeAccount, (int) Auth::id(), $year));
    }

    public function initialize(Request $request, int $account): JsonResponse
    {
        $payload = $request->validate([
            'tax_year' => ['required', 'integer', 'min:1900', 'max:2200'],
            'partnership_name' => ['nullable', 'string', 'max:255'],
            'initial_cash_contribution_cents' => ['nullable', 'integer'],
            'initial_property_contribution_adjusted_basis_cents' => ['nullable', 'integer'],
            'initial_tax_basis_capital_cents' => ['nullable', 'integer'],
            'initial_book_capital_or_fmv_cents' => ['nullable', 'integer'],
            'initial_outside_basis_override_cents' => ['nullable', 'integer'],
            'initialization_review_status' => ['nullable', 'in:reviewed,needs_review'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $basisYear = $this->partnershipBasisService->initializeAccount($this->account($account), (int) Auth::id(), $payload);

        return response()->json($this->partnershipBasisService->basisYearToArray($basisYear->load('partnershipInterest.basisEvents')), 201);
    }

    public function storeEvent(Request $request, int $account): JsonResponse
    {
        $payload = $this->eventPayload($request);
        $event = $this->partnershipBasisService->createManualEvent($this->account($account), (int) Auth::id(), $payload);

        return response()->json($this->partnershipBasisService->eventToArray($event), 201);
    }

    public function updateEvent(Request $request, int $account, int $event): JsonResponse
    {
        $financeAccount = $this->account($account);
        $basisEvent = FinPartnershipBasisEvent::query()
            ->where('id', $event)
            ->where('user_id', Auth::id())
            ->where('account_id', $financeAccount->acct_id)
            ->firstOrFail();

        $payload = $this->eventPayload($request, false);
        $basisEvent->fill($payload)->save();
        $this->partnershipBasisService->recomputeInterestYear($basisEvent->partnershipInterest, (int) $basisEvent->tax_year);

        return response()->json($this->partnershipBasisService->eventToArray($basisEvent->refresh()));
    }

    public function recompute(Request $request, int $account): JsonResponse
    {
        $year = $this->year($request);
        $financeAccount = $this->account($account);
        $this->partnershipBasisService->recomputeForUserYear((int) Auth::id(), $year);

        return response()->json($this->partnershipBasisService->accountBasisData($financeAccount, (int) Auth::id(), $year));
    }

    public function lock(Request $request, int $account): JsonResponse
    {
        $basisYear = $this->partnershipBasisService->lockAccountYear($this->account($account), (int) Auth::id(), $this->year($request));
        abort_if($basisYear === null, 404);

        return response()->json($this->partnershipBasisService->basisYearToArray($basisYear->load('partnershipInterest.basisEvents')));
    }

    private function account(int $accountId): FinAccounts
    {
        /** @var FinAccounts $account */
        $account = FinAccounts::query()->where('acct_id', $accountId)->where('acct_owner', Auth::id())->firstOrFail();

        return $account;
    }

    private function year(Request $request): int
    {
        return (int) $request->validate(['year' => ['required', 'integer', 'min:1900', 'max:2200']])['year'];
    }

    /** @return array<string, mixed> */
    private function eventPayload(Request $request, bool $requireTaxYear = true): array
    {
        return $request->validate([
            'tax_year' => [$requireTaxYear ? 'required' : 'sometimes', 'integer', 'min:1900', 'max:2200'],
            'event_date' => ['nullable', 'date'],
            'event_order' => ['nullable', 'integer'],
            'basis_side' => ['nullable', 'in:outside,inside,both,memorandum'],
            'event_type' => [$requireTaxYear ? 'required' : 'sometimes', 'string', 'max:60'],
            'amount_cents' => [$requireTaxYear ? 'required' : 'sometimes', 'integer'],
            'source_type' => ['nullable', 'in:k1_field,k1_code,account_transaction,statement,statement_investment,manual,carryforward'],
            'line_item_id' => ['nullable', 'integer'],
            'statement_id' => ['nullable', 'integer'],
            'statement_investment_id' => ['nullable', 'integer'],
            'source_path' => ['nullable', 'string', 'max:255'],
            'source_label' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'review_status' => ['nullable', 'in:reviewed,needs_review'],
            'metadata' => ['nullable', 'array'],
        ]);
    }
}
