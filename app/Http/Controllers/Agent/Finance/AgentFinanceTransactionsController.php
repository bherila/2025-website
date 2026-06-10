<?php

namespace App\Http\Controllers\Agent\Finance;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountTag;
use App\Services\Finance\Agent\TransactionsQueryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * GET /api/agent/v1/finance/transactions — owner-scoped, bounded transaction
 * list with offset-cursor pagination. Filters: ?acct_id ?year ?tag
 * ?limit (default 100, max 500) ?cursor. Requires finance.transactions.view;
 * a non-owned acct_id yields 404.
 */
class AgentFinanceTransactionsController extends Controller
{
    public function __construct(private readonly TransactionsQueryService $transactions) {}

    public function __invoke(Request $request): JsonResponse
    {
        $limit = max(1, min((int) ($request->input('limit') ?? 100), 500));
        $cursor = max(0, (int) $request->input('cursor', 0));

        $query = $this->transactions->queryForUser(
            (int) Auth::id(),
            $request->filled('acct_id') ? (int) $request->input('acct_id') : null,
            $request->filled('year') ? (int) $request->input('year') : null,
            $request->filled('tag') ? (string) $request->input('tag') : null,
        );

        $items = $query->offset($cursor)->limit($limit + 1)->get();
        $hasMore = $items->count() > $limit;
        $items = $items->take($limit);

        return response()->json([
            'transactions' => $items
                ->map(fn (FinAccountLineItems $item): array => [
                    't_id' => $item->t_id,
                    't_account' => $item->t_account,
                    't_date' => $item->t_date,
                    't_date_posted' => $item->t_date_posted,
                    't_type' => $item->t_type,
                    't_schc_category' => $item->t_schc_category,
                    't_amt' => $item->t_amt,
                    't_symbol' => $item->t_symbol,
                    't_qty' => $item->t_qty,
                    't_price' => $item->t_price,
                    't_commission' => $item->t_commission,
                    't_fee' => $item->t_fee,
                    't_description' => $item->t_description,
                    't_comment' => $item->t_comment,
                    't_from' => $item->t_from,
                    't_to' => $item->t_to,
                    't_interest_rate' => $item->t_interest_rate,
                    't_harvested_amount' => $item->t_harvested_amount,
                    't_account_balance' => $item->t_account_balance,
                    'tags' => $item->tags
                        ->map(fn (FinAccountTag $tag): array => [
                            'tag_id' => $tag->tag_id,
                            'tag_label' => $tag->tag_label,
                            'tag_color' => $tag->tag_color,
                        ])
                        ->values()
                        ->all(),
                ])
                ->values()
                ->all(),
            'next_cursor' => $hasMore ? $cursor + $limit : null,
        ]);
    }
}
