<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\RunLotMatcherFullRebuildRequest;
use App\Http\Requests\Finance\RunLotMatcherRequest;
use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\CapitalGains\LotMatcherService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class TaxDocumentLotsMatchController extends Controller
{
    public function __construct(
        private readonly LotMatcherService $lotMatcherService,
    ) {}

    public function store(RunLotMatcherRequest $request, int $id): JsonResponse
    {
        $taxDocument = $this->ownedTaxDocument($id);
        $result = $this->lotMatcherService->runMatcherForDocument(
            (int) $taxDocument->id,
            $request->boolean('preserve_decisions', true),
        );

        return response()->json($result->toArray());
    }

    public function fullRebuild(RunLotMatcherFullRebuildRequest $request, int $id): JsonResponse
    {
        $request->validated();
        $taxDocument = $this->ownedTaxDocument($id);
        $result = $this->lotMatcherService->runMatcherForDocument((int) $taxDocument->id, preserveDecisions: false);

        return response()->json($result->toArray());
    }

    private function ownedTaxDocument(int $id): FileForTaxDocument
    {
        return FileForTaxDocument::query()
            ->where('user_id', (int) Auth::id())
            ->findOrFail($id);
    }
}
