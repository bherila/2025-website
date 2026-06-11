<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use Illuminate\Contracts\View\View;

class FinanceHomeController extends Controller
{
    public function index(): View
    {
        return view('finance.home');
    }
}
