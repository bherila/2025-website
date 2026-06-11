<?php

namespace App\Http\Controllers\Agent\Finance;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinPayslips;
use App\Services\Finance\Agent\PayslipsQueryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * GET /api/agent/v1/finance/payslips — owner-scoped payslips with per-state
 * tax data and deposit splits. ?year filters by pay date year. Requires
 * finance.payslips.view.
 */
class AgentFinancePayslipsController extends Controller
{
    /** @var list<string> Explicit payslip field list (canonical fillable columns + primary key). */
    private const FIELDS = [
        'payslip_id', 'uid', 'period_start', 'period_end', 'pay_date', 'employment_entity_id',
        'earnings_gross', 'earnings_bonus', 'earnings_net_pay', 'earnings_rsu', 'earnings_dividend_equivalent',
        'imp_other', 'imp_legal', 'imp_fitness', 'imp_ltd', 'imp_life_choice',
        'ps_oasdi', 'ps_medicare', 'ps_fed_tax', 'ps_fed_tax_addl', 'ps_fed_tax_refunded',
        'taxable_wages_oasdi', 'taxable_wages_medicare', 'taxable_wages_federal',
        'ps_rsu_tax_offset', 'ps_rsu_excess_refund',
        'ps_401k_pretax', 'ps_401k_aftertax', 'ps_401k_employer',
        'ps_pretax_medical', 'ps_pretax_fsa', 'ps_salary', 'ps_vacation_payout',
        'ps_pretax_dental', 'ps_pretax_vision',
        'pto_accrued', 'pto_used', 'pto_available', 'pto_statutory_available', 'hours_worked',
        'ps_is_estimated', 'ps_comment', 'other',
    ];

    public function __construct(private readonly PayslipsQueryService $payslips) {}

    public function __invoke(Request $request): JsonResponse
    {
        $limit = max(1, min((int) ($request->input('limit') ?? 100), 500));
        $cursor = max(0, (int) $request->input('cursor', 0));

        $payslips = $this->payslips->listForUser(
            (int) Auth::id(),
            $request->filled('year') ? (int) $request->input('year') : null,
            $request->boolean('has_rsu'),
            $request->boolean('has_bonus'),
            $limit + 1,
            $cursor,
        );

        $hasMore = $payslips->count() > $limit;
        $payslips = $payslips->take($limit);

        return response()->json([
            'payslips' => $payslips
                ->map(function (FinPayslips $payslip): array {
                    $arr = $payslip->toArray();
                    $row = array_intersect_key($arr, array_flip(self::FIELDS));

                    if (is_string($row['other'] ?? null)) {
                        $row['other'] = json_decode($row['other'], true);
                    }

                    $row['state_data'] = $arr['state_data'] ?? [];
                    $row['deposits'] = $arr['deposits'] ?? [];

                    return $row;
                })
                ->values()
                ->all(),
            'next_cursor' => $hasMore ? $cursor + $limit : null,
        ]);
    }
}
