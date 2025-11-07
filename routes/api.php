<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\FinanceApiController;

Route::middleware(['web','auth'])->get('/finance/accounts', [FinanceApiController::class, 'accounts']);
Route::middleware(['web','auth'])->post('/finance/accounts', [FinanceApiController::class, 'createAccount']);
Route::middleware(['web','auth'])->post('/finance/accounts/balance', [FinanceApiController::class, 'updateBalance']);