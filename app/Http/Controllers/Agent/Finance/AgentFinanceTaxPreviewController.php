<?php

namespace App\Http\Controllers\Agent\Finance;

use App\Http\Controllers\Controller;
use App\Services\Finance\Agent\AccountsQueryService;
use App\Services\Finance\TaxPreviewDataService;
use App\Support\Agent\AgentContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * GET /api/agent/v1/finance/tax-preview/{year} — full tax preview dataset for
 * the year. ?include_tax_facts=1 adds the backend tax fact source lines.
 * Requires finance.tax-preview.view.
 */
class AgentFinanceTaxPreviewController extends Controller
{
    public function __construct(private readonly TaxPreviewDataService $service) {}

    public function __invoke(Request $request, AgentContext $context, int $year): JsonResponse
    {
        $data = $this->service->datasetForYear(
            (int) Auth::id(),
            $year,
            $request->boolean('include_tax_facts'),
        );

        return response()->json($this->agentSafePayload($data, $context));
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function agentSafePayload(array $data, AgentContext $context): array
    {
        if (isset($data['accounts']) && is_array($data['accounts'])) {
            $includeDetail = $context->can('finance.accounts.detail');
            $data['accounts'] = array_values(array_map(
                fn (mixed $account): array => is_array($account) ? $this->safeAccount($account, $includeDetail) : [],
                $data['accounts'],
            ));
        }

        return $this->stripAccountNumbers($data);
    }

    /**
     * @param  array<string, mixed>  $account
     * @return array<string, mixed>
     */
    private function safeAccount(array $account, bool $includeDetail): array
    {
        $allowed = array_flip($includeDetail ? AccountsQueryService::DETAIL_COLUMNS : AccountsQueryService::BASIC_COLUMNS);

        return array_intersect_key($account, $allowed);
    }

    private function stripAccountNumbers(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        foreach ($value as $key => $child) {
            if (in_array($key, ['acct_number', 'account_number', 'ai_identifier'], true)) {
                unset($value[$key]);

                continue;
            }

            $value[$key] = $this->stripAccountNumbers($child);
        }

        return $value;
    }
}
