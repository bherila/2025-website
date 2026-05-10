<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\CapitalGains\LotImportFromParsedDataService;
use App\Services\Finance\TaxPreviewFactsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class TaxDocumentLotsRebuildController extends Controller
{
    public function __construct(
        private readonly LotImportFromParsedDataService $lotImportFromParsedDataService,
        private readonly TaxPreviewFactsService $taxPreviewFactsService,
    ) {}

    public function store(int $id): JsonResponse
    {
        $taxDocument = FileForTaxDocument::query()
            ->where('user_id', (int) Auth::id())
            ->findOrFail($id);

        if ($taxDocument->genai_status !== 'parsed' && ! $this->lotImportFromParsedDataService->hasUsableParsedData($taxDocument)) {
            return response()->json([
                'message' => 'This tax document has not been parsed and has no usable parsed 1099-B data to rebuild lots from.',
                'reason' => 'not_parsed_without_parsed_data',
            ], 422);
        }

        $result = $this->lotImportFromParsedDataService->rebuildForTaxDocument((int) $taxDocument->id);

        return response()->json(array_merge($result->toArray(), [
            'refreshedTaxFacts' => $this->taxPreviewFactsService->arrayForYear(
                (int) $taxDocument->user_id,
                (int) $taxDocument->tax_year,
            ),
        ]));
    }
}
