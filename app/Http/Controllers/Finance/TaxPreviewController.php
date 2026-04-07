<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\Finance\TaxPreviewDataService;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TaxPreviewController extends Controller
{
    public function __construct(
        private TaxPreviewDataService $preloadService,
    ) {}

    public function show(Request $request): View
    {
        $year = (int) ($request->query('year') ?? date('Y'));

        $preload = $this->preloadService->forYear(Auth::id(), $year);

        return view('finance.tax-preview', [
            'preload' => $preload,
            'year' => $year,
        ]);
    }
}
