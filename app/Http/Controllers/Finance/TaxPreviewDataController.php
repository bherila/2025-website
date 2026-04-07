<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\Finance\TaxPreviewDataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TaxPreviewDataController extends Controller
{
    public function __construct(
        private TaxPreviewDataService $taxPreviewDataService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $defaultYear = (int) date('Y');
        $yearParam = $request->query('year');
        $year = $defaultYear;

        if (is_numeric($yearParam)) {
            $parsedYear = (int) $yearParam;
            if ($parsedYear > 0) {
                $year = $parsedYear;
            }
        }

        return response()->json(
            $this->taxPreviewDataService->datasetForYear((int) Auth::id(), $year),
        );
    }
}
