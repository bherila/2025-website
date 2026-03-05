<?php

namespace App\Http\Controllers;

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

        $lots = $query->orderBy('symbol')
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
        ]);

        return response()->json([
            'success' => true,
            'lot' => $lot,
        ], 201);
    }
}
