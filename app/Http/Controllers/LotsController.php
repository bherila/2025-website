<?php

namespace App\Http\Controllers;

use App\Models\FinAccountLineItems;
use App\Models\FinAccountLot;
use App\Models\FinAccounts;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class LotsController extends Controller
{
    /**
     * List lots for an account.
     * Query params: status=open|closed, year=YYYY (for closed lots)
     */
    public function index(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $query = FinAccountLot::where('acct_id', $account->acct_id);

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
                ->whereNotNull('sale_date')
                ->selectRaw('DISTINCT strftime("%Y", sale_date) as year')
                ->orderByDesc('year')
                ->pluck('year')
                ->map(fn($y) => (int) $y)
                ->toArray();
        } else {
            $closedYears = DB::table('fin_account_lots')
                ->where('acct_id', $account->acct_id)
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

    /**
     * Create a new lot manually.
     */
    public function store(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

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
        $isShortTerm = null;
        $realizedGainLoss = null;

        if (!empty($validated['sale_date'])) {
            $purchaseDate = new \DateTime($validated['purchase_date']);
            $saleDate = new \DateTime($validated['sale_date']);
            $diff = $purchaseDate->diff($saleDate);
            $isShortTerm = $diff->days <= 365;

            if (isset($validated['proceeds'])) {
                $realizedGainLoss = $validated['proceeds'] - $validated['cost_basis'];
            }
        }

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
    public function searchTransactions(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $validated = $request->validate([
            'dates' => 'required|array',
            'dates.*' => 'date',
        ]);

        $transactions = FinAccountLineItems::where('t_account', $account->acct_id)
            ->whereNull('when_deleted')
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
    public function importLots(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

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
                    if (!empty($lotData['sale_date']) && empty($existing->sale_date)) {
                        $updateData['sale_date'] = $lotData['sale_date'];
                        $updateData['proceeds'] = $lotData['proceeds'] ?? null;
                        $updateData['realized_gain_loss'] = $lotData['realized_gain_loss'] ?? null;
                        $updateData['is_short_term'] = $lotData['is_short_term'] ?? null;
                    }
                    if (!empty($lotData['open_t_id'])) {
                        $updateData['open_t_id'] = $lotData['open_t_id'];
                    }
                    if (!empty($lotData['close_t_id'])) {
                        $updateData['close_t_id'] = $lotData['close_t_id'];
                    }
                    if (!empty($updateData)) {
                        $existing->update($updateData);
                        $updated++;
                    }
                } else {
                    // Compute derived fields if not provided
                    $isShortTerm = $lotData['is_short_term'] ?? null;
                    $realizedGainLoss = $lotData['realized_gain_loss'] ?? null;

                    if (!empty($lotData['sale_date']) && $isShortTerm === null) {
                        $purchaseDate = new \DateTime($lotData['purchase_date']);
                        $saleDate = new \DateTime($lotData['sale_date']);
                        $diff = $purchaseDate->diff($saleDate);
                        $isShortTerm = $diff->days <= 365;
                    }

                    if (!empty($lotData['sale_date']) && $realizedGainLoss === null && isset($lotData['proceeds'])) {
                        $realizedGainLoss = $lotData['proceeds'] - $lotData['cost_basis'];
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
            return response()->json(['error' => 'Failed to import lots: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Get lots linked to a specific transaction.
     */
    public function lotsByTransaction(Request $request, $account_id, $t_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $lots = FinAccountLot::where('acct_id', $account->acct_id)
            ->where(function ($q) use ($t_id) {
                $q->where('open_t_id', $t_id)
                  ->orWhere('close_t_id', $t_id);
            })
            ->get();

        return response()->json(['lots' => $lots]);
    }
}
