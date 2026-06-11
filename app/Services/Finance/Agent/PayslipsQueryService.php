<?php

namespace App\Services\Finance\Agent;

use App\Models\FinanceTool\FinPayslips;
use Illuminate\Database\Eloquent\Collection;

/**
 * Owner-scoped payslip queries shared by the MCP list_payslips tool and the
 * agent REST surface. Extracted behavior-preserving from
 * App\Mcp\Tools\ListPayslips.
 */
class PayslipsQueryService
{
    /**
     * Payslips for the user (newest first) with state data and deposit splits
     * eager-loaded.
     *
     * @return Collection<int, FinPayslips>
     */
    public function listForUser(
        int $userId,
        ?int $year = null,
        bool $hasRsu = false,
        bool $hasBonus = false,
        ?int $limit = null,
        int $offset = 0,
    ): Collection {
        $query = FinPayslips::where('uid', $userId)
            ->with(['stateData', 'deposits'])
            ->orderBy('pay_date', 'desc');

        if ($year !== null) {
            $query->whereBetween('pay_date', ["{$year}-01-01", "{$year}-12-31"]);
        }

        if ($hasRsu) {
            $query->where('earnings_rsu', '>', 0);
        }

        if ($hasBonus) {
            $query->where('earnings_bonus', '>', 0);
        }

        if ($limit !== null) {
            $query->orderBy('payslip_id', 'desc')->offset($offset)->limit($limit);
        }

        return $query->get();
    }
}
