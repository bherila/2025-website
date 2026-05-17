<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use Illuminate\View\View;

class PageController extends Controller
{
    public function index(): View
    {
        return view('phr.index');
    }
}
