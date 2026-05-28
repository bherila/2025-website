<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Resources\Finance\NormalizedLotResource;
use App\Services\Finance\CapitalGains\LotWorkspaceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class LotWorkspaceController extends Controller
{
    public function __construct(
        private readonly LotWorkspaceService $lotWorkspaceService,
    ) {}

    /**
     * GET /api/finance/lot-workspace
     *
     * Paginated lot workspace with scope/filter params and summary aggregates.
     */
    public function index(Request $request): JsonResponse
    {
        $userId = (int) Auth::id();

        $params = [
            'user_id' => $userId,
            'account_ids' => $this->parseIntArray($request->query('account_ids')),
            'year' => $request->query('year') !== null ? (int) $request->query('year') : null,
            'date_from' => $request->query('date_from'),
            'date_to' => $request->query('date_to'),
            'source' => $this->parseStringArray($request->query('source')),
            'reconciliation_state' => $this->parseStringArray($request->query('reconciliation_state')),
            'status' => in_array($request->query('status'), ['open', 'closed', 'all'], true)
                ? $request->query('status')
                : 'all',
            'include_superseded' => filter_var($request->query('include_superseded', 'false'), FILTER_VALIDATE_BOOLEAN),
            'symbol' => $request->query('symbol'),
            'cusip' => $request->query('cusip'),
            'document_id' => $request->query('document_id') !== null ? (int) $request->query('document_id') : null,
            'per_page' => $request->query('per_page') !== null ? (int) $request->query('per_page') : 50,
            'page' => $request->query('page') !== null ? (int) $request->query('page') : 1,
        ];

        $paginator = $this->lotWorkspaceService->query($params);
        $summary = $this->lotWorkspaceService->summary($params);

        return response()->json([
            'data' => NormalizedLotResource::collection($paginator->items()),
            'summary' => $summary,
            'closed_years' => $this->lotWorkspaceService->closedYears($params),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    /**
     * @return int[]|null
     */
    private function parseIntArray(mixed $value): ?array
    {
        if ($value === null) {
            return null;
        }
        if (is_string($value)) {
            $value = explode(',', $value);
        }
        if (! is_array($value)) {
            return null;
        }

        return array_map(static fn ($v) => (int) $v, array_filter($value, static fn ($v) => is_numeric($v)));
    }

    /**
     * @return string|string[]|null
     */
    private function parseStringArray(mixed $value): array|string|null
    {
        if ($value === null) {
            return null;
        }
        if (is_string($value) && str_contains($value, ',')) {
            return explode(',', $value);
        }

        return $value;
    }
}
