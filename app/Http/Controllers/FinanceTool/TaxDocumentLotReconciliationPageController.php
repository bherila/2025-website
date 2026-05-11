<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\Files\FileForTaxDocument;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Facades\Auth;

class TaxDocumentLotReconciliationPageController extends Controller
{
    public function show(int $id): View
    {
        $taxDocument = FileForTaxDocument::query()
            ->where('user_id', (int) Auth::id())
            ->findOrFail($id);

        return view('finance.tax-document-lot-reconciliation', [
            'taxDocumentId' => (int) $taxDocument->id,
            'taxYear' => (int) $taxDocument->tax_year,
            'title' => '1099-B Reconciliation',
        ]);
    }
}
