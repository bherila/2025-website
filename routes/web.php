<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\LoginController;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/login', function () {
    return view('login');
})->name('login');

Route::post('/login', [LoginController::class, 'login']);

Route::get('/tools/maxmin', function () {
    return view('tools.maxmin');
});

Route::middleware('auth')->group(function () {
    Route::get('/finance/rsu', function () {
        return view('finance.rsu');
    });

    Route::get('/finance/payslips', function () {
        return view('finance.payslips');
    });

    Route::get('/finance/accounts', function () {
        return view('finance.accounts');
    });
});

Route::get('/tools/license-manager', function () {
    return view('tools.license-manager');
});

Route::get('/tools/bingo', function () {
    return view('tools.bingo');
});

Route::get('/tools/irs-f461', function () {
    return view('tools.irs-f461');
});
