<?php

namespace App\Http\Controllers\FinanceTool;

use App\Enums\Finance\PartnershipBasisEventType;
use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPartnershipBasisEvent;
use App\Models\FinanceTool\FinPartnershipBasisYear;
use App\Services\Finance\PartnershipBasisService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

class PartnershipBasisController extends Controller
{
    public function __construct(private readonly PartnershipBasisService $partnershipBasisService) {}

    public function show(Request $request, int $account): JsonResponse
    {
        // Reads never mutate basis state; use the recompute endpoint to (re)sync from K-1s.
        $year = $this->year($request);
        $financeAccount = $this->account($account);

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
            'interest_start_date' => ['nullable', 'date'],
            'initialization_review_status' => ['nullable', 'in:reviewed,needs_review'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $basisYear = $this->partnershipBasisService->initializeAccount($this->account($account), (int) Auth::id(), $payload);

        return response()->json($this->partnershipBasisService->basisYearToArray($this->loadYearEvents($basisYear)), 201);
    }

    public function updateInterest(Request $request, int $account, int $interest): JsonResponse
    {
        $payload = $request->validate([
            'partnership_name' => ['sometimes', 'string', 'max:255'],
            'partnership_ein' => ['sometimes', 'nullable', 'string', 'max:32'],
            'interest_start_date' => ['sometimes', 'nullable', 'date'],
            'interest_end_date' => ['sometimes', 'nullable', 'date'],
            'is_ptp' => ['sometimes', 'boolean'],
            'is_trader_fund' => ['sometimes', 'boolean'],
        ]);

        $updated = $this->partnershipBasisService->updateInterest($this->account($account), (int) Auth::id(), $interest, $payload);

        return response()->json($this->partnershipBasisService->interestToArray($updated));
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

        $interest = $basisEvent->partnershipInterest;
        $originalYear = (int) $basisEvent->tax_year;
        $payload = $this->eventPayload($request, false);
        unset($payload['partnership_interest_id']);

        // The rollforward sorts events by event_order, so a type change without an explicit order
        // must re-seat the event at the canonical slot for its new type (e.g. a distribution
        // corrected to income must apply before same-year distributions, not after).
        if (array_key_exists('event_type', $payload) && ! array_key_exists('event_order', $payload)) {
            $payload['event_order'] = $this->partnershipBasisService->eventOrder((string) $payload['event_type']);
        }

        $newYear = isset($payload['tax_year']) ? (int) $payload['tax_year'] : $originalYear;

        $this->partnershipBasisService->assertYearEditable($interest, $originalYear);
        if ($newYear !== $originalYear) {
            $this->partnershipBasisService->assertYearEditable($interest, $newYear);
        }

        $basisEvent->fill($payload)->save();

        // Recompute the whole rollforward from the earliest affected year through the interest's
        // latest year. A moved event no longer counts in the year it left, and every downstream
        // year — including intervening ones — reads a refreshed carryforward instead of a stale one.
        $this->partnershipBasisService->recomputeInterestYearRange($interest, min($originalYear, $newYear), max($originalYear, $newYear));

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
        $year = $this->year($request);
        $financeAccount = $this->account($account);
        $basisYears = $this->partnershipBasisService->lockAccountYear($financeAccount, (int) Auth::id(), $year);
        abort_if($basisYears->isEmpty(), 404);

        return response()->json($this->partnershipBasisService->accountBasisData($financeAccount, (int) Auth::id(), $year));
    }

    public function unlock(Request $request, int $account): JsonResponse
    {
        $year = $this->year($request);
        $financeAccount = $this->account($account);
        $basisYears = $this->partnershipBasisService->unlockAccountYear($financeAccount, (int) Auth::id(), $year);
        abort_if($basisYears->isEmpty(), 404);

        return response()->json($this->partnershipBasisService->accountBasisData($financeAccount, (int) Auth::id(), $year));
    }

    private function loadYearEvents(FinPartnershipBasisYear $basisYear): FinPartnershipBasisYear
    {
        return $basisYear->load(['partnershipInterest.basisEvents' => fn ($events) => $events->where('tax_year', $basisYear->tax_year)->orderBy('event_order')->orderBy('id')]);
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
            'partnership_interest_id' => ['nullable', 'integer'],
            'event_date' => ['nullable', 'date'],
            'event_order' => ['nullable', 'integer'],
            'basis_side' => ['nullable', 'in:outside,inside,both,memorandum'],
            // Reject unknown event types: an unrecognised type would persist a source row that
            // silently has no basis effect during the rollforward.
            'event_type' => [$requireTaxYear ? 'required' : 'sometimes', 'string', 'max:60', Rule::enum(PartnershipBasisEventType::class)],
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
