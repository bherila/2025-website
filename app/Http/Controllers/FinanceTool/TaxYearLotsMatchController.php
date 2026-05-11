<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\RunTaxYearLotMatcherRequest;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Services\Finance\CapitalGains\LotMatcherService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class TaxYearLotsMatchController extends Controller
{
    public function __construct(
        private readonly LotMatcherService $lotMatcherService,
    ) {}

    public function store(RunTaxYearLotMatcherRequest $request, int $year): JsonResponse
    {
        $validated = $request->validated();
        $taxYear = (int) $validated['year'];
        $documents = FileForTaxDocument::query()
            ->where('user_id', (int) Auth::id())
            ->where('tax_year', $taxYear)
            ->where('is_reviewed', true)
            ->where(function (Builder $query): void {
                $query->whereIn('form_type', ['1099_b', 'broker_1099'])
                    ->orWhereHas('accountLinks', function (Builder $linkQuery): void {
                        $linkQuery->where('form_type', '1099_b');
                    });
            })
            ->orderBy('id')
            ->get();

        $aggregateCounts = $this->emptyCounts();
        $documentResults = [];

        foreach ($documents as $document) {
            $result = $this->lotMatcherService->runMatcherForDocument((int) $document->id, preserveDecisions: true);
            $aggregateCounts = $this->mergeCounts($aggregateCounts, $result->counts);
            $documentResults[] = [
                'tax_document_id' => (int) $document->id,
                'broker' => $document->original_filename,
                'counts' => $result->counts,
            ];
        }

        return response()->json([
            'tax_year' => $taxYear,
            'document_count' => $documents->count(),
            'counts' => $aggregateCounts,
            'documents' => $documentResults,
        ]);
    }

    /**
     * @return array<string, int>
     */
    private function emptyCounts(): array
    {
        return array_fill_keys(FinLotReconciliationLink::STATES, 0);
    }

    /**
     * @param  array<string, int>  $base
     * @param  array<string, int>  $next
     * @return array<string, int>
     */
    private function mergeCounts(array $base, array $next): array
    {
        foreach ($next as $state => $count) {
            $base[(string) $state] = ($base[(string) $state] ?? 0) + (int) $count;
        }

        return $base;
    }
}
