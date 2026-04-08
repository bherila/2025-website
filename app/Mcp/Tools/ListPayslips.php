<?php

namespace App\Mcp\Tools;

use App\Models\FinanceTool\FinPayslips;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('List payslips for the authenticated user. Supports filtering by year, has_rsu, and has_bonus. Returns all payslip fields including earnings, taxes, deductions, retirement contributions, RSU tax offsets, taxable wage bases, PTO balances, per-state tax data (state_data), deposit splits (deposits), and catch-all other.')]
class ListPayslips extends Tool
{
    public function handle(Request $request): Response
    {
        $uid = Auth::id();

        $query = FinPayslips::where('uid', $uid)
            ->with(['stateData', 'deposits'])
            ->orderBy('pay_date', 'desc');

        if ($request->has('year')) {
            $year = (int) $request->input('year');
            $query->whereBetween('pay_date', ["{$year}-01-01", "{$year}-12-31"]);
        }

        if ($request->boolean('has_rsu')) {
            $query->where('earnings_rsu', '>', 0);
        }

        if ($request->boolean('has_bonus')) {
            $query->where('earnings_bonus', '>', 0);
        }

        $payslips = $query->get()->map(function ($payslip) {
            $arr = $payslip->toArray();

            // Decode other field
            if (is_string($arr['other'] ?? null)) {
                $arr['other'] = json_decode($arr['other'], true);
            }

            return $arr;
        });

        return Response::json($payslips);
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'year' => $schema->integer()->description('Filter to a specific tax year (e.g. 2025); omit for all years')->nullable(),
            'has_rsu' => $schema->boolean()->description('When true, return only payslips with RSU vesting income (earnings_rsu > 0)')->nullable(),
            'has_bonus' => $schema->boolean()->description('When true, return only payslips with bonus income (earnings_bonus > 0)')->nullable(),
        ];
    }
}
