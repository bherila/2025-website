<?php

namespace App\Http\Controllers\Agent\Finance;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinAccountLot;
use App\Services\Finance\Agent\LotsQueryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * GET /api/agent/v1/finance/lots — owner-scoped investment lots. ?acct_id
 * filters to one account; ?year returns lots held at that year-end
 * (as-of December 31), otherwise only currently open lots. Requires
 * finance.lots.view.
 */
class AgentFinanceLotsController extends Controller
{
    public function __construct(private readonly LotsQueryService $lots) {}

    public function __invoke(Request $request): JsonResponse
    {
        $limit = max(1, min((int) ($request->input('limit') ?? 100), 500));
        $cursor = max(0, (int) $request->input('cursor', 0));

        $asOf = $request->filled('year') ? sprintf('%d-12-31', (int) $request->input('year')) : null;

        $lots = $this->lots->listForUser(
            (int) Auth::id(),
            $request->filled('acct_id') ? (int) $request->input('acct_id') : null,
            $asOf,
            $limit + 1,
            $cursor,
        );

        $hasMore = $lots->count() > $limit;
        $lots = $lots->take($limit);

        return response()->json([
            'lots' => $lots
                ->map(fn (FinAccountLot $lot): array => [
                    'acct_id' => $lot->acct_id,
                    'symbol' => $lot->symbol,
                    'quantity' => $lot->quantity,
                    'purchase_date' => $lot->purchase_date?->toDateString(),
                    'sale_date' => $lot->sale_date?->toDateString(),
                    'cost_basis' => $lot->cost_basis,
                    'cost_per_unit' => $lot->cost_per_unit,
                ])
                ->values()
                ->all(),
            'next_cursor' => $hasMore ? $cursor + $limit : null,
        ]);
    }
}
