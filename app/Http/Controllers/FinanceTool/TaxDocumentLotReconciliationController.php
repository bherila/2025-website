<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\CapitalGains\LotReconciliationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class TaxDocumentLotReconciliationController extends Controller
{
    public function __construct(
        private readonly LotReconciliationService $lotReconciliationService,
    ) {}

    public function show(int $id): JsonResponse
    {
        $taxDocument = FileForTaxDocument::query()
            ->where('user_id', (int) Auth::id())
            ->findOrFail($id);

        return response()->json($this->lotReconciliationService->reconcileTaxDocument((int) $taxDocument->id));
    }

    public function year(int $year): JsonResponse
    {
        if ($year < 1900 || $year > 2100) {
            return response()->json([
                'message' => 'The selected year is invalid.',
                'errors' => [
                    'year' => ['The year must be between 1900 and 2100.'],
                ],
            ], 422);
        }

        return response()->json($this->lotReconciliationService->reconcileYear((int) Auth::id(), $year));
    }
}
