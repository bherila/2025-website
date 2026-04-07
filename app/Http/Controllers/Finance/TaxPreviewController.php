<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\Finance\TaxPreviewDataService;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TaxPreviewController extends Controller
{
    public function __construct(
        private TaxPreviewDataService $taxPreviewDataService,
    ) {}

    public function show(Request $request): View|RedirectResponse
    {
        $defaultYear = (int) date('Y');
        $yearParam = $request->query('year');
        $year = $defaultYear;

        if ($yearParam !== null && $yearParam !== '') {
            if (is_numeric($yearParam)) {
                $parsedYear = (int) $yearParam;
                if ($parsedYear > 0) {
                    $year = $parsedYear;
                } else {
                    // Non-numeric year param (e.g. "all") — redirect to the default year
                    return redirect('/finance/tax-preview?year=' . $defaultYear);
                }
            } else {
                // Non-numeric year param (e.g. "all") — redirect to the default year
                return redirect('/finance/tax-preview?year=' . $defaultYear);
            }
        }

        return view('finance.tax-preview', [
            'preload' => $this->taxPreviewDataService->shellForYear((int) Auth::id(), $year),
            'year' => $year,
        ]);
    }
}
