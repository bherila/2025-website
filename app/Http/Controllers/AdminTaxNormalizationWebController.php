<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Gate;
use Illuminate\View\View;

class AdminTaxNormalizationWebController extends Controller
{
    /**
     * Show the Admin Tax Normalization Review page.
     * GET /admin/tax-normalization-review
     */
    public function index(): View
    {
        Gate::authorize('admin');

        return view('admin.tax-normalization-review');
    }
}
