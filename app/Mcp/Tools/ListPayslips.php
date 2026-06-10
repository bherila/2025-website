<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Mcp\Support\FiltersByFeature;
use App\Mcp\Support\RequiresFeature;
use App\Services\Finance\Agent\PayslipsQueryService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('List payslips for the authenticated user. Supports filtering by year, has_rsu, and has_bonus. Returns all payslip fields including earnings, taxes, deductions, retirement contributions, RSU tax offsets, taxable wage bases, PTO balances, per-state tax data (state_data), deposit splits (deposits), and catch-all other.')]
class ListPayslips extends Tool implements RequiresFeature
{
    use AuthorizesFeatureAccess;
    use FiltersByFeature;

    public static function requiredFeature(): ?string
    {
        return 'finance.payslips.view';
    }

    public function __construct(
        private PayslipsQueryService $payslips,
    ) {}

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('finance.payslips.view')) !== null) {
            return $denied;
        }

        $payslips = $this->payslips->listForUser(
            (int) Auth::id(),
            $request->has('year') ? (int) $request->input('year') : null,
            $request->boolean('has_rsu'),
            $request->boolean('has_bonus'),
        )->map(function ($payslip) {
            $arr = $payslip->toArray();

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
