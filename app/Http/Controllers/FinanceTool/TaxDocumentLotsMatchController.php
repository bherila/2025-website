<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\RunLotMatcherFullRebuildRequest;
use App\Http\Requests\Finance\RunLotMatcherRequest;
use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\CapitalGains\LotMatcherService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class TaxDocumentLotsMatchController extends Controller
{
    public function __construct(
        private readonly LotMatcherService $lotMatcherService,
    ) {}

    public function store(RunLotMatcherRequest $request, int $id): JsonResponse
    {
        $taxDocument = $this->ownedTaxDocument($id);
        $result = $this->lotMatcherService->runMatcherForDocument(
            $this->documentId($taxDocument),
            $request->boolean('preserve_decisions', true),
        );

        return response()->json($result->toArray());
    }

    public function fullRebuild(RunLotMatcherFullRebuildRequest $request, int $id): JsonResponse
    {
        $request->validated();
        $taxDocument = $this->ownedTaxDocument($id);
        $result = $this->lotMatcherService->runMatcherForDocument($this->documentId($taxDocument), preserveDecisions: false);

        return response()->json($result->toArray());
    }

    private function ownedTaxDocument(int $id): FileForTaxDocument
    {
        return FileForTaxDocument::query()
            ->where('user_id', (int) Auth::id())
            ->findOrFail($id);
    }

    private function documentId(FileForTaxDocument $taxDocument): int
    {
        if ($taxDocument->document_id === null) {
            throw ValidationException::withMessages([
                'tax_document' => 'Tax document is not linked to a finance document.',
            ]);
        }

        return (int) $taxDocument->document_id;
    }
}
