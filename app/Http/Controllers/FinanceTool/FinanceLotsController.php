<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Controllers\FinanceTool\Concerns\QueriesUserAccounts;
use App\Http\Requests\Finance\ApplyLotReconciliationRequest;
use App\Http\Requests\Finance\TaxLotReconciliationRequest;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Services\Finance\TaxLotReconciliationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class FinanceLotsController extends Controller
{
    use QueriesUserAccounts;

    /**
     * List all lots for the current user (across all accounts).
     * Used by Form 1116 worksheet for adjusted basis discovery.
     *
     * Query params:
     *   status  open|closed  (default: open; any other value falls back to open)
     *   as_of   YYYY-MM-DD   (optional; if provided, returns lots held on that date:
     *                          purchase_date <= as_of AND (sale_date IS NULL OR sale_date > as_of))
     */
    public function showAllLots(Request $request): JsonResponse
    {
        $accountIds = $this->getUserAccountIds();

        $rawStatus = $request->query('status');
        $status = in_array($rawStatus, ['open', 'closed'], true) ? $rawStatus : 'open';

        // Closed-lot mode returns full columns needed by Form 8949 (per-transaction detail).
        // Open-lot / as_of mode remains narrow (acct_id + basis + dates) for Form 1116 worksheet.
        $selectColumns = $status === 'closed'
            ? ['lot_id', 'acct_id', 'symbol', 'description', 'cusip', 'quantity', 'purchase_date', 'cost_basis', 'sale_date', 'proceeds', 'realized_gain_loss', 'is_short_term', 'lot_source', 'tax_document_id', 'form_8949_box', 'is_covered', 'accrued_market_discount', 'wash_sale_disallowed']
            : ['acct_id', 'cost_basis', 'purchase_date', 'sale_date'];

        $query = FinAccountLot::whereIn('acct_id', $accountIds)->select($selectColumns);
        if (! $request->boolean('include_superseded')) {
            $query->whereNull('superseded_by_lot_id');
        }

        $asOf = $request->query('as_of');

        if ($asOf) {
            // Return lots held on the given date: bought on/before as_of and not yet sold (or sold after as_of).
            $query->where('purchase_date', '<=', $asOf)
                ->where(function ($q) use ($asOf): void {
                    $q->whereNull('sale_date')->orWhere('sale_date', '>', $asOf);
                });
        } elseif ($status === 'closed') {
            $query->whereNotNull('sale_date');
            $year = $request->query('year');
            if ($year !== null && ctype_digit((string) $year)) {
                $query->whereYear('sale_date', (int) $year);
            }
        } else {
            $query->whereNull('sale_date');
        }

        $lots = $query->orderBy('purchase_date', 'desc')->get();

        return response()->json(['lots' => $lots]);
    }

    /**
     * List lots for an account.
     * Query params: status=open|closed, year=YYYY (for closed lots)
     */
    public function index(Request $request, int $account_id): JsonResponse
    {
        $account = $this->resolveOwnedAccount($account_id);

        $query = FinAccountLot::where('acct_id', $account->acct_id);
        if (! $request->boolean('include_superseded')) {
            $query->whereNull('superseded_by_lot_id');
        }

        $status = $request->query('status', 'open');

        if ($status === 'open') {
            $query->whereNull('sale_date');
        } else {
            $query->whereNotNull('sale_date');

            $year = $request->query('year');
            if ($year) {
                $query->whereYear('sale_date', $year);
            }
        }

        $lots = $query->with('statement')
            ->orderBy('symbol')
            ->orderBy('purchase_date')
            ->get();

        // Compute summary for closed lots
        $summary = null;
        if ($status === 'closed') {
            $summary = [
                'short_term_gains' => $lots->where('is_short_term', true)
                    ->where('realized_gain_loss', '>', 0)
                    ->sum('realized_gain_loss'),
                'short_term_losses' => $lots->where('is_short_term', true)
                    ->where('realized_gain_loss', '<', 0)
                    ->sum('realized_gain_loss'),
                'long_term_gains' => $lots->where('is_short_term', false)
                    ->where('realized_gain_loss', '>', 0)
                    ->sum('realized_gain_loss'),
                'long_term_losses' => $lots->where('is_short_term', false)
                    ->where('realized_gain_loss', '<', 0)
                    ->sum('realized_gain_loss'),
                'total_realized' => $lots->sum('realized_gain_loss'),
            ];
        }

        // Get available years for closed lots
        if (DB::getDriverName() === 'sqlite') {
            $closedYears = DB::table('fin_account_lots')
                ->where('acct_id', $account->acct_id)
                ->whereNull('superseded_by_lot_id')
                ->whereNotNull('sale_date')
                ->selectRaw('DISTINCT strftime("%Y", sale_date) as year')
                ->orderByDesc('year')
                ->pluck('year')
                ->map(fn ($y) => (int) $y)
                ->toArray();
        } else {
            $closedYears = DB::table('fin_account_lots')
                ->where('acct_id', $account->acct_id)
                ->whereNull('superseded_by_lot_id')
                ->whereNotNull('sale_date')
                ->selectRaw('DISTINCT YEAR(sale_date) as year')
                ->orderByDesc('year')
                ->pluck('year')
                ->toArray();
        }

        return response()->json([
            'lots' => $lots,
            'summary' => $summary,
            'closedYears' => $closedYears,
        ]);
    }

    public function reconciliation(TaxLotReconciliationRequest $request, TaxLotReconciliationService $service): JsonResponse
    {
        $validated = $request->validated();

        return response()->json($service->reconcile((int) Auth::id(), (int) $validated['tax_year']));
    }

    public function accountReconciliation(
        TaxLotReconciliationRequest $request,
        int $account_id,
        TaxLotReconciliationService $service,
    ): JsonResponse {
        $account = $this->resolveOwnedAccount($account_id);
        $validated = $request->validated();

        return response()->json($service->reconcile((int) Auth::id(), (int) $validated['tax_year'], (int) $account->acct_id));
    }

    public function applyReconciliation(ApplyLotReconciliationRequest $request, int $account_id): JsonResponse
    {
        $account = $this->resolveOwnedAccount($account_id);
        $supersedeRows = $request->supersedeRows();
        $acceptedLotIds = $request->acceptedLotIds();
        $conflictRows = $request->conflictRows();

        DB::transaction(function () use ($account, $supersedeRows, $acceptedLotIds, $conflictRows): void {
            $lotIds = [];
            foreach ($supersedeRows as $row) {
                $lotIds[] = $row['keep_lot_id'];
                $lotIds[] = $row['drop_lot_id'];
            }
            foreach ($acceptedLotIds as $lotId) {
                $lotIds[] = $lotId;
            }
            foreach ($conflictRows as $row) {
                $lotIds[] = $row['lot_id'];
            }
            $lotIds = array_values(array_unique($lotIds));

            $lots = $this->reconciliationLotsById((int) $account->acct_id, $lotIds);

            if (count($lots) !== count($lotIds)) {
                throw ValidationException::withMessages([
                    'lot_id' => 'All reconciliation lots must belong to this account.',
                ]);
            }

            foreach ($supersedeRows as $row) {
                $keepLotId = $row['keep_lot_id'];
                $dropLotId = $row['drop_lot_id'];

                if ($keepLotId === $dropLotId) {
                    throw ValidationException::withMessages([
                        'supersede' => 'A lot cannot supersede itself.',
                    ]);
                }

                $dropLot = $this->reconciliationLotFromMap($lots, $dropLotId);
                $dropLot->update([
                    'superseded_by_lot_id' => $keepLotId,
                    'reconciliation_status' => 'accepted',
                ]);

                $keepLot = $this->reconciliationLotFromMap($lots, $keepLotId);
                $keepLot->update(['reconciliation_status' => 'accepted']);
            }

            foreach ($acceptedLotIds as $lotId) {
                $lot = $this->reconciliationLotFromMap($lots, $lotId);
                $lot->update(['reconciliation_status' => 'accepted']);
            }

            foreach ($conflictRows as $row) {
                $lot = $this->reconciliationLotFromMap($lots, $row['lot_id']);
                $lot->update([
                    'reconciliation_status' => $row['status'],
                    'reconciliation_notes' => $row['notes'],
                ]);
            }
        });

        return response()->json(['success' => true]);
    }

    /**
     * @param  int[]  $lotIds
     * @return array<int, FinAccountLot>
     */
    private function reconciliationLotsById(int $accountId, array $lotIds): array
    {
        $lots = [];

        foreach (FinAccountLot::where('acct_id', $accountId)->whereIn('lot_id', $lotIds)->get() as $lot) {
            $lots[(int) $lot->lot_id] = $lot;
        }

        return $lots;
    }

    /**
     * @param  array<int, FinAccountLot>  $lots
     */
    private function reconciliationLotFromMap(array $lots, int $lotId): FinAccountLot
    {
        $lot = $lots[$lotId] ?? null;
        if (! $lot instanceof FinAccountLot) {
            throw ValidationException::withMessages([
                'lot_id' => 'All reconciliation lots must belong to this account.',
            ]);
        }

        return $lot;
    }

    /**
     * Create a new lot manually.
     */
    public function store(Request $request, int $account_id): JsonResponse
    {
        $account = $this->resolveOwnedAccount($account_id);

        $validated = $request->validate([
            'symbol' => 'required|string|max:50',
            'description' => 'nullable|string|max:255',
            'quantity' => 'required|numeric',
            'purchase_date' => 'required|date',
            'cost_basis' => 'required|numeric',
            'cost_per_unit' => 'nullable|numeric',
            'sale_date' => 'nullable|date',
            'proceeds' => 'nullable|numeric',
            'open_t_id' => 'nullable|integer',
            'close_t_id' => 'nullable|integer',
        ]);

        // Compute derived fields
        ['is_short_term' => $isShortTerm, 'realized_gain_loss' => $realizedGainLoss] =
            FinAccountLot::computeMetrics(
                $validated['purchase_date'],
                $validated['sale_date'] ?? null,
                isset($validated['proceeds']) ? (float) $validated['proceeds'] : null,
                (float) $validated['cost_basis'],
            );

        $lot = FinAccountLot::create([
            'acct_id' => $account->acct_id,
            'symbol' => $validated['symbol'],
            'description' => $validated['description'] ?? null,
            'quantity' => $validated['quantity'],
            'purchase_date' => $validated['purchase_date'],
            'cost_basis' => $validated['cost_basis'],
            'cost_per_unit' => $validated['cost_per_unit'] ?? null,
            'sale_date' => $validated['sale_date'] ?? null,
            'proceeds' => $validated['proceeds'] ?? null,
            'realized_gain_loss' => $realizedGainLoss,
            'is_short_term' => $isShortTerm,
            'lot_source' => 'manual',
            'open_t_id' => $validated['open_t_id'] ?? null,
            'close_t_id' => $validated['close_t_id'] ?? null,
        ]);

        return response()->json([
            'success' => true,
            'lot' => $lot,
        ], 201);
    }

    /**
     * Search transactions by date range for matching lots during import.
     */
    public function searchTransactions(Request $request, int $account_id): JsonResponse
    {
        $account = $this->resolveOwnedAccount($account_id);

        $validated = $request->validate([
            'dates' => 'required|array',
            'dates.*' => 'date',
        ]);

        $transactions = FinAccountLineItems::where('t_account', $account->acct_id)
            ->whereIn('t_date', $validated['dates'])
            ->select('t_id', 't_date', 't_type', 't_description', 't_symbol', 't_qty', 't_amt', 't_price')
            ->orderBy('t_date')
            ->orderBy('t_id')
            ->get();

        return response()->json(['transactions' => $transactions]);
    }

    /**
     * Bulk import lots (from Fidelity TSV paste).
     */
    public function importLots(Request $request, int $account_id): JsonResponse
    {
        $account = $this->resolveOwnedAccount($account_id);

        $validated = $request->validate([
            'lots' => 'required|array|min:1',
            'lots.*.symbol' => 'required|string|max:50',
            'lots.*.description' => 'nullable|string|max:255',
            'lots.*.quantity' => 'required|numeric',
            'lots.*.purchase_date' => 'required|date',
            'lots.*.cost_basis' => 'required|numeric',
            'lots.*.cost_per_unit' => 'nullable|numeric',
            'lots.*.sale_date' => 'nullable|date',
            'lots.*.proceeds' => 'nullable|numeric',
            'lots.*.realized_gain_loss' => 'nullable|numeric',
            'lots.*.is_short_term' => 'nullable|boolean',
            'lots.*.open_t_id' => 'nullable|integer',
            'lots.*.close_t_id' => 'nullable|integer',
        ]);

        $created = 0;
        $updated = 0;

        DB::beginTransaction();
        try {
            foreach ($validated['lots'] as $lotData) {
                // Check for existing lot (same acct, symbol, purchase_date, quantity, cost_basis)
                $existing = FinAccountLot::where('acct_id', $account->acct_id)
                    ->where('symbol', $lotData['symbol'])
                    ->whereDate('purchase_date', $lotData['purchase_date'])
                    ->where('quantity', $lotData['quantity'])
                    ->where('cost_basis', $lotData['cost_basis'])
                    ->first();

                if ($existing) {
                    // Update existing lot with new close data if it's now closed
                    $updateData = [];
                    if (! empty($lotData['sale_date']) && empty($existing->sale_date)) {
                        $updateData['sale_date'] = $lotData['sale_date'];
                        $updateData['proceeds'] = $lotData['proceeds'] ?? null;
                        $updateData['realized_gain_loss'] = $lotData['realized_gain_loss'] ?? null;
                        $updateData['is_short_term'] = $lotData['is_short_term'] ?? null;
                    }
                    if (! empty($lotData['open_t_id'])) {
                        $updateData['open_t_id'] = $lotData['open_t_id'];
                    }
                    if (! empty($lotData['close_t_id'])) {
                        $updateData['close_t_id'] = $lotData['close_t_id'];
                    }
                    if (! empty($updateData)) {
                        $existing->update($updateData);
                        $updated++;
                    }
                } else {
                    // Compute derived fields if not provided
                    $isShortTerm = $lotData['is_short_term'] ?? null;
                    $realizedGainLoss = $lotData['realized_gain_loss'] ?? null;

                    if (! empty($lotData['sale_date'])) {
                        $metrics = FinAccountLot::computeMetrics(
                            $lotData['purchase_date'],
                            $lotData['sale_date'],
                            isset($lotData['proceeds']) ? (float) $lotData['proceeds'] : null,
                            (float) $lotData['cost_basis'],
                        );
                        $isShortTerm ??= $metrics['is_short_term'];
                        $realizedGainLoss ??= $metrics['realized_gain_loss'];
                    }

                    FinAccountLot::create([
                        'acct_id' => $account->acct_id,
                        'symbol' => $lotData['symbol'],
                        'description' => $lotData['description'] ?? null,
                        'quantity' => $lotData['quantity'],
                        'purchase_date' => $lotData['purchase_date'],
                        'cost_basis' => $lotData['cost_basis'],
                        'cost_per_unit' => $lotData['cost_per_unit'] ?? null,
                        'sale_date' => $lotData['sale_date'] ?? null,
                        'proceeds' => $lotData['proceeds'] ?? null,
                        'realized_gain_loss' => $realizedGainLoss,
                        'is_short_term' => $isShortTerm,
                        'lot_source' => 'fidelity_import',
                        'open_t_id' => $lotData['open_t_id'] ?? null,
                        'close_t_id' => $lotData['close_t_id'] ?? null,
                    ]);
                    $created++;
                }
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'created' => $created,
                'updated' => $updated,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json(['error' => 'Failed to import lots: '.$e->getMessage()], 500);
        }
    }

    /**
     * Get lots linked to a specific transaction.
     */
    public function lotsByTransaction(Request $request, int $account_id, int $t_id): JsonResponse
    {
        $account = $this->resolveOwnedAccount($account_id);

        $lots = FinAccountLot::where('acct_id', $account->acct_id)
            ->where(function ($q) use ($t_id) {
                $q->where('open_t_id', $t_id)
                    ->orWhere('close_t_id', $t_id);
            })
            ->get();

        return response()->json(['lots' => $lots]);
    }

    /**
     * Save lots from the Lot Analyzer (wash sale engine) output.
     *
     * Each lot maps a closing transaction (sale) to one or more opening
     * transactions (buys). A single close_t_id can appear in multiple lot
     * records when the sale matched against several opening lots (e.g. FIFO).
     *
     * This endpoint first removes any existing analyzer-sourced lots for
     * the account (lot_source = 'analyzer'), then inserts the new set.
     */
    public function saveAnalyzedLots(Request $request, int $account_id): JsonResponse
    {
        $account = $this->resolveOwnedAccount($account_id);

        $validated = $request->validate([
            'lots' => 'required|array|min:1',
            'lots.*.symbol' => 'required|string|max:50',
            'lots.*.description' => 'nullable|string|max:255',
            'lots.*.quantity' => 'required|numeric',
            'lots.*.purchase_date' => 'required|date',
            'lots.*.cost_basis' => 'required|numeric',
            'lots.*.sale_date' => 'nullable|date',
            'lots.*.proceeds' => 'nullable|numeric',
            'lots.*.realized_gain_loss' => 'nullable|numeric',
            'lots.*.is_short_term' => 'nullable|boolean',
            'lots.*.open_t_id' => 'nullable|integer',
            'lots.*.close_t_id' => 'nullable|integer',
        ]);

        DB::beginTransaction();
        try {
            // Remove previously analyzer-saved lots for this account
            FinAccountLot::where('acct_id', $account->acct_id)
                ->where('lot_source', 'analyzer')
                ->delete();

            $created = 0;
            foreach ($validated['lots'] as $lotData) {
                $isShortTerm = $lotData['is_short_term'] ?? null;
                $realizedGainLoss = $lotData['realized_gain_loss'] ?? null;

                if (! empty($lotData['sale_date'])) {
                    $metrics = FinAccountLot::computeMetrics(
                        $lotData['purchase_date'],
                        $lotData['sale_date'],
                        isset($lotData['proceeds']) ? (float) $lotData['proceeds'] : null,
                        (float) $lotData['cost_basis'],
                    );
                    $isShortTerm ??= $metrics['is_short_term'];
                    $realizedGainLoss ??= $metrics['realized_gain_loss'];
                }

                FinAccountLot::create([
                    'acct_id' => $account->acct_id,
                    'symbol' => $lotData['symbol'],
                    'description' => $lotData['description'] ?? null,
                    'quantity' => $lotData['quantity'],
                    'purchase_date' => $lotData['purchase_date'],
                    'cost_basis' => $lotData['cost_basis'],
                    'cost_per_unit' => isset($lotData['quantity']) && $lotData['quantity'] > 0
                        ? $lotData['cost_basis'] / $lotData['quantity']
                        : null,
                    'sale_date' => $lotData['sale_date'] ?? null,
                    'proceeds' => $lotData['proceeds'] ?? null,
                    'realized_gain_loss' => $realizedGainLoss,
                    'is_short_term' => $isShortTerm,
                    'lot_source' => 'analyzer',
                    'open_t_id' => $lotData['open_t_id'] ?? null,
                    'close_t_id' => $lotData['close_t_id'] ?? null,
                ]);
                $created++;
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'created' => $created,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json(['error' => 'Failed to save lots: '.$e->getMessage()], 500);
        }
    }

    /**
     * Update a single lot (e.g. reassign opening/closing transaction IDs).
     */
    public function updateLot(Request $request, int $account_id, int $lot_id): JsonResponse
    {
        $account = $this->resolveOwnedAccount($account_id);

        $lot = FinAccountLot::where('lot_id', $lot_id)
            ->where('acct_id', $account->acct_id)
            ->firstOrFail();

        $validated = $request->validate([
            'open_t_id' => 'nullable|integer',
            'close_t_id' => 'nullable|integer',
            'quantity' => 'nullable|numeric',
            'cost_basis' => 'nullable|numeric',
            'proceeds' => 'nullable|numeric',
            'sale_date' => 'nullable|date',
            'purchase_date' => 'nullable|date',
        ]);

        $updateData = array_filter($validated, fn ($v) => $v !== null);

        // Recompute derived fields if relevant data changes
        $purchaseDate = $validated['purchase_date'] ?? $lot->purchase_date;
        $saleDate = $validated['sale_date'] ?? $lot->sale_date;
        if ($purchaseDate && $saleDate) {
            $pd = $purchaseDate instanceof \DateTime ? $purchaseDate : new \DateTime((string) $purchaseDate);
            $sd = $saleDate instanceof \DateTime ? $saleDate : new \DateTime((string) $saleDate);
            $updateData['is_short_term'] = $pd->diff($sd)->days <= 365;
        }

        $costBasis = $validated['cost_basis'] ?? $lot->cost_basis;
        $proceeds = $validated['proceeds'] ?? $lot->proceeds;
        if ($costBasis !== null && $proceeds !== null && $saleDate) {
            $updateData['realized_gain_loss'] = (float) $proceeds - (float) $costBasis;
        }

        $lot->update($updateData);

        return response()->json(['success' => true, 'lot' => $lot->fresh()]);
    }

    /**
     * Delete a single lot.
     */
    public function deleteLot(Request $request, int $account_id, int $lot_id): JsonResponse
    {
        $account = $this->resolveOwnedAccount($account_id);

        $lot = FinAccountLot::where('lot_id', $lot_id)
            ->where('acct_id', $account->acct_id)
            ->firstOrFail();

        $lot->delete();

        return response()->json(['success' => true]);
    }

    /**
     * Search for potential opening transactions by symbol across all user accounts.
     * Used by the Lot Analyzer to manually match closing transactions (sales)
     * with opening transactions (buys) that may be from earlier years.
     *
     * This is distinct from TransactionLinkModal — that links related
     * transfers across accounts; this links buy/sell lot pairs for tax reporting.
     */
    public function searchOpeningTransactions(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'symbol' => 'required|string|max:20',
            'type' => 'nullable|string|in:buy,sell',
        ]);

        $accountIds = $this->getUserAccountIds();

        $query = FinAccountLineItems::whereIn('t_account', $accountIds)
            ->where('t_symbol', 'LIKE', $validated['symbol'])
            ->select('t_id', 't_account', 't_date', 't_type', 't_description', 't_symbol', 't_qty', 't_amt', 't_price')
            ->orderBy('t_date')
            ->orderBy('t_id');

        // Filter to buy-type transactions by default (opening a long position)
        $typeFilter = $validated['type'] ?? 'buy';
        if ($typeFilter === 'buy') {
            $query->where(function ($q) {
                $q->where('t_type', 'LIKE', '%Buy%')
                    ->orWhere('t_type', 'LIKE', '%Reinvest%');
            })->where(function ($q) {
                // Exclude closing short transactions
                $q->where('t_type', 'NOT LIKE', '%cover%')
                    ->where('t_type', 'NOT LIKE', '%close%');
            });
        } elseif ($typeFilter === 'sell') {
            $query->where(function ($q) {
                $q->where('t_type', 'LIKE', '%Sell%')
                    ->orWhere('t_type', 'LIKE', '%short%');
            });
        }

        // Cap at 200 results to keep the search modal responsive
        $transactions = $query->limit(200)->get();

        // Enrich with account name
        $accounts = FinAccounts::whereIn('acct_id', $accountIds)->pluck('acct_name', 'acct_id');
        $transactions->transform(function ($t) use ($accounts) {
            $t->acct_name = $accounts[$t->t_account] ?? null;

            return $t;
        });

        return response()->json(['transactions' => $transactions]);
    }

    /**
     * Save a manual lot assignment (linking an opening transaction to a closing transaction).
     * This persists the lot so the user does not have to repeat manual matching.
     */
    public function saveLotAssignment(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'assignments' => 'required|array|min:1',
            'assignments.*.close_t_id' => 'required|integer',
            'assignments.*.open_t_id' => 'required|integer',
            'assignments.*.symbol' => 'required|string|max:50',
            'assignments.*.quantity' => 'required|numeric',
            'assignments.*.purchase_date' => 'required|date',
            'assignments.*.cost_basis' => 'required|numeric',
            'assignments.*.sale_date' => 'required|date',
            'assignments.*.proceeds' => 'required|numeric',
        ]);

        // Verify all transactions belong to this user
        $accountIds = $this->getUserAccountIds();

        $created = 0;
        DB::beginTransaction();
        try {
            foreach ($validated['assignments'] as $assignment) {
                // Verify the close and open transactions belong to user
                $closeTx = FinAccountLineItems::whereIn('t_account', $accountIds)
                    ->where('t_id', $assignment['close_t_id'])
                    ->firstOrFail();
                $openTx = FinAccountLineItems::whereIn('t_account', $accountIds)
                    ->where('t_id', $assignment['open_t_id'])
                    ->firstOrFail();

                $purchaseDate = new \DateTime($assignment['purchase_date']);
                $saleDate = new \DateTime($assignment['sale_date']);
                $isShortTerm = $purchaseDate->diff($saleDate)->days <= 365;

                FinAccountLot::create([
                    'acct_id' => $closeTx->t_account,
                    'symbol' => $assignment['symbol'],
                    'quantity' => $assignment['quantity'],
                    'purchase_date' => $assignment['purchase_date'],
                    'cost_basis' => $assignment['cost_basis'],
                    'cost_per_unit' => $assignment['quantity'] > 0
                        ? $assignment['cost_basis'] / $assignment['quantity']
                        : null,
                    'sale_date' => $assignment['sale_date'],
                    'proceeds' => $assignment['proceeds'],
                    'realized_gain_loss' => $assignment['proceeds'] - $assignment['cost_basis'],
                    'is_short_term' => $isShortTerm,
                    'lot_source' => 'manual',
                    'open_t_id' => $assignment['open_t_id'],
                    'close_t_id' => $assignment['close_t_id'],
                ]);
                $created++;
            }

            DB::commit();

            return response()->json(['success' => true, 'created' => $created]);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json(['error' => 'Failed to save lot assignments: '.$e->getMessage()], 500);
        }
    }
}
