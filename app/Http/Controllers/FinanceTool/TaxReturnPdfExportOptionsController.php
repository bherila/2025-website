<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Services\Finance\TaxReturnPdf\IrsReturnPdfExportOptionsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TaxReturnPdfExportOptionsController extends Controller
{
    public function __construct(
        private readonly IrsReturnPdfExportOptionsService $optionsService,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year' => ['required', 'integer', 'min:1900', 'max:2100'],
        ]);

        return response()->json($this->optionsService->forUser(Auth::user(), (int) $validated['year']));
    }
}
