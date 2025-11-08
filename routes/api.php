<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\FinanceApiController;

Route::middleware('auth')->get('/finance/accounts', [FinanceApiController::class, 'accounts']);
Route::middleware('auth')->post('/finance/accounts', [FinanceApiController::class, 'createAccount']);
Route::middleware('auth')->post('/finance/accounts/balance', [FinanceApiController::class, 'updateBalance']);
Route::middleware('auth')->get('/finance/chart', [FinanceApiController::class, 'chartData']);