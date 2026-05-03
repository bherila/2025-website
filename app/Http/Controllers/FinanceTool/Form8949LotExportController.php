<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\Form8949LotExportRequest;
use App\Models\Files\FileForTaxDocument;
use App\Services\Finance\Form8949LotExportService;
use App\Services\Finance\OltXlsxWriter;
use App\Services\Finance\TxfWriter;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;

class Form8949LotExportController extends Controller
{
    public function txf(
        Form8949LotExportRequest $request,
        Form8949LotExportService $service,
        TxfWriter $writer,
    ): Response {
        $lots = $service->lotsForRequest((int) Auth::id(), $request->validated());
        if ($lots === []) {
            return response('No 1099-B lots were found for export.', 422);
        }

        return response($writer->write($lots), 200, [
            'Content-Type' => 'text/plain; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="'.$this->filename($request, 'txf').'"',
        ]);
    }

    public function oltXlsx(
        Form8949LotExportRequest $request,
        Form8949LotExportService $service,
        OltXlsxWriter $writer,
    ): Response {
        $lots = $service->lotsForRequest((int) Auth::id(), $request->validated());
        if ($lots === []) {
            return response('No 1099-B lots were found for export.', 422);
        }

        return response($writer->write($lots), 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="'.$this->filename($request, 'xlsx').'"',
        ]);
    }

    private function filename(Form8949LotExportRequest $request, string $extension): string
    {
        $taxYear = $request->validated('tax_year') ?? $this->taxYearFromDocument($request);
        $prefix = $request->validated('scope') === 'account_document' ? '1099b-lots' : '1099b-lots-all';
        $year = is_numeric($taxYear) ? '-'.$taxYear : '';

        return "{$prefix}{$year}.{$extension}";
    }

    private function taxYearFromDocument(Form8949LotExportRequest $request): ?int
    {
        $taxDocumentId = $request->validated('tax_document_id');
        if (! is_numeric($taxDocumentId)) {
            return null;
        }

        $document = FileForTaxDocument::query()
            ->where('id', (int) $taxDocumentId)
            ->where('user_id', Auth::id())
            ->first();

        return $document instanceof FileForTaxDocument ? (int) $document->tax_year : null;
    }
}
