<?php

namespace App\Services\Finance\Agent;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Database\Eloquent\Collection;

/**
 * Owner-scoped investment lot queries shared by the MCP list_lots tool and
 * the agent REST surface. Extracted behavior-preserving from
 * App\Mcp\Tools\ListLots.
 */
class LotsQueryService
{
    /** @var list<string> */
    public const COLUMNS = ['acct_id', 'cost_basis', 'purchase_date', 'sale_date', 'symbol', 'quantity', 'cost_per_unit'];

    /**
     * Lots scoped to the user's accounts. With $asOf, returns lots held on
     * that date; without it, only currently open lots.
     *
     * @return Collection<int, FinAccountLot>
     */
    public function listForUser(
        int $userId,
        ?int $accountId = null,
        ?string $asOf = null,
        ?int $limit = null,
        int $offset = 0,
    ): Collection {
        if ($accountId !== null) {
            $accountIds = FinAccounts::where('acct_owner', $userId)
                ->where('acct_id', $accountId)
                ->pluck('acct_id');
        } else {
            $accountIds = FinAccounts::where('acct_owner', $userId)->pluck('acct_id');
        }

        $query = FinAccountLot::whereIn('acct_id', $accountIds)
            ->select(self::COLUMNS);

        if ($asOf) {
            $query->where('purchase_date', '<=', $asOf)
                ->where(fn ($q) => $q->whereNull('sale_date')->orWhere('sale_date', '>', $asOf));
        } else {
            $query->whereNull('sale_date');
        }

        $query->orderBy('purchase_date', 'desc');

        if ($limit !== null) {
            $query->orderBy('lot_id', 'desc')->offset($offset)->limit($limit);
        }

        return $query->get();
    }
}
