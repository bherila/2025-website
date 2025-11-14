<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\FinanceAccountsController;
use App\Http\Controllers\LoginController;
use App\Http\Controllers\PayslipController;

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
    Route::get('/dashboard', [App\Http\Controllers\DashboardController::class, 'index']);

    Route::get('/finance/rsu', function () {
        return view('finance.rsu');
    });

    Route::get('/finance/rsu/add-grant', function () {
        return view('finance.rsu-add-grant');
    });

    Route::get('/finance/payslips', [PayslipController::class, 'index']);
    Route::get('/finance/payslips/entry', [PayslipController::class, 'entry']);

    Route::get('/finance/accounts', [FinanceAccountsController::class, 'index']);
    Route::get('/finance/{account_id}', [FinanceAccountsController::class, 'show']);
    Route::get('/finance/{account_id}/summary', [FinanceAccountsController::class, 'summary']);
    Route::get('/finance/{account_id}/balance-timeseries', [FinanceAccountsController::class, 'balanceTimeseries']);
    Route::get('/finance/{account_id}/maintenance', [FinanceAccountsController::class, 'maintenance']);
    Route::get('/finance/{account_id}/import-transactions', [FinanceAccountsController::class, 'showImportTransactionsPage']);
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

Route::get('/recipes', [App\Http\Controllers\RecipeController::class, 'index'])->name('recipes.index');
Route::get('/recipes/{slug}', [App\Http\Controllers\RecipeController::class, 'show'])->name('recipes.show');

Route::get('/projects', function () {
    return view('projects');
})->name('projects');
