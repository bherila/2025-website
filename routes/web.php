<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\FinanceAccountsController;
use App\Http\Controllers\LoginController;
use App\Http\Controllers\PayslipController;
use App\Http\Controllers\ClientManagement\ClientCompanyController;

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
    Route::get('/finance/tags', function () {
        return view('finance.tags');
    });
    Route::get('/finance/{account_id}', [FinanceAccountsController::class, 'show']);
    Route::get('/finance/{account_id}/summary', [FinanceAccountsController::class, 'summary']);
    Route::get('/finance/{account_id}/statements', [FinanceAccountsController::class, 'statements']);
    Route::get('/finance/{account_id}/maintenance', [FinanceAccountsController::class, 'maintenance']);
    Route::get('/finance/{account_id}/duplicates', [FinanceAccountsController::class, 'duplicates']);
    Route::get('/finance/{account_id}/linker', [FinanceAccountsController::class, 'linker']);
    Route::get('/finance/{account_id}/import-transactions', [FinanceAccountsController::class, 'showImportTransactionsPage']);

    Route::get('/tools/license-manager', function () {
        return view('tools.license-manager');
    });

    // Client Management Routes
    Route::get('/client/mgmt', [ClientCompanyController::class, 'index'])->name('client-management.index');
    Route::get('/client/mgmt/new', [ClientCompanyController::class, 'create'])->name('client-management.create');
    Route::post('/client/mgmt', [ClientCompanyController::class, 'store'])->name('client-management.store');
    Route::get('/client/mgmt/{id}', [ClientCompanyController::class, 'show'])->name('client-management.show');
    Route::delete('/client/mgmt/{id}', [ClientCompanyController::class, 'destroy'])->name('client-management.destroy');
});

Route::get('/tools/bingo', [App\Http\Controllers\BingoController::class, 'index']);

Route::get('/tools/irs-f461', function () {
    return view('tools.irs-f461');
});

Route::get('/recipes', [App\Http\Controllers\RecipeController::class, 'index'])->name('recipes.index');
Route::get('/recipes/{slug}', [App\Http\Controllers\RecipeController::class, 'show'])->name('recipes.show');

Route::get('/projects', function () {
    return view('projects');
})->name('projects');
