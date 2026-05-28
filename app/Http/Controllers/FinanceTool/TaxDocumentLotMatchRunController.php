<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\LotMatchRun;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class TaxDocumentLotMatchRunController extends Controller
{
    public function index(int $id): JsonResponse
    {
        $taxDocument = FileForTaxDocument::query()
            ->where('user_id', (int) Auth::id())
            ->findOrFail($id);

        $runs = $taxDocument->document_id === null
            ? collect()
            : LotMatchRun::query()
                ->where('document_id', (int) $taxDocument->document_id)
                ->where('user_id', (int) Auth::id())
                ->latest('id')
                ->limit(10)
                ->get();

        return response()->json([
            'tax_document_id' => (int) $taxDocument->id,
            'document_id' => $taxDocument->document_id !== null ? (int) $taxDocument->document_id : null,
            'runs' => $runs
                ->map(fn (LotMatchRun $run): array => $run->payload())
                ->values(),
        ]);
    }
}
