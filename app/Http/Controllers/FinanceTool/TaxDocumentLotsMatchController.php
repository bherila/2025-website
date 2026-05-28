<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\RunLotMatcherFullRebuildRequest;
use App\Http\Requests\Finance\RunLotMatcherRequest;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\LotMatchRun;
use App\Services\Finance\CapitalGains\LotMatcherService;
use App\Services\Finance\CapitalGains\LotMatchRunRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class TaxDocumentLotsMatchController extends Controller
{
    public function __construct(
        private readonly LotMatcherService $lotMatcherService,
        private readonly LotMatchRunRecorder $lotMatchRunRecorder,
    ) {}

    public function store(RunLotMatcherRequest $request, int $id): JsonResponse
    {
        $request->validated();
        $taxDocument = $this->ownedTaxDocument($id);
        $run = $this->lotMatchRunRecorder->running(
            $this->lotMatchRunRecorder->queued(
                $this->documentId($taxDocument),
                (int) Auth::id(),
                (int) $taxDocument->tax_year,
                LotMatchRun::MODE_PRESERVE,
            )
        );

        try {
            $result = $this->lotMatcherService->runMatcherForDocument($this->documentId($taxDocument), preserveDecisions: true);
            $this->lotMatchRunRecorder->succeeded($run, $result, (int) $taxDocument->tax_year);

            return response()->json(array_merge($result->toArray(), [
                'match_run' => $run->payload(),
            ]));
        } catch (\Throwable $exception) {
            $this->lotMatchRunRecorder->failed($run, $exception, (int) $taxDocument->tax_year);

            throw $exception;
        }
    }

    public function fullRebuild(RunLotMatcherFullRebuildRequest $request, int $id): JsonResponse
    {
        $request->validated();
        $taxDocument = $this->ownedTaxDocument($id);
        $run = $this->lotMatchRunRecorder->running(
            $this->lotMatchRunRecorder->queued(
                $this->documentId($taxDocument),
                (int) Auth::id(),
                (int) $taxDocument->tax_year,
                LotMatchRun::MODE_FORCE,
            )
        );

        try {
            $result = $this->lotMatcherService->runMatcherForDocument($this->documentId($taxDocument), preserveDecisions: false);
            $this->lotMatchRunRecorder->succeeded($run, $result, (int) $taxDocument->tax_year);

            return response()->json(array_merge($result->toArray(), [
                'match_run' => $run->payload(),
            ]));
        } catch (\Throwable $exception) {
            $this->lotMatchRunRecorder->failed($run, $exception, (int) $taxDocument->tax_year);

            throw $exception;
        }
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
