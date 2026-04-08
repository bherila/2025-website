<?php

namespace App\Mcp\Tools;

use App\Models\FinanceTool\FinPayslips;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('List payslips for the authenticated user. Supports filtering by year. Returns all payslip fields including earnings, taxes, deductions, and retirement contributions.')]
class ListPayslips extends Tool
{
    public function handle(Request $request): Response
    {
        $uid = Auth::id();

        $query = FinPayslips::where('uid', $uid)
            ->orderBy('pay_date', 'desc');

        if ($request->has('year')) {
            $year = (int) $request->input('year');
            $query->whereBetween('pay_date', ["{$year}-01-01", "{$year}-12-31"]);
        }

        $payslips = $query->get()->map(function ($payslip) {
            if (is_string($payslip->other)) {
                $payslip->other = json_decode($payslip->other, true);
            }

            return $payslip;
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
        ];
    }
}
