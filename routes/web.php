<?php

use App\Http\Controllers\ClientManagement\ClientAgreementController;
use App\Http\Controllers\ClientManagement\ClientCompanyController;
use App\Http\Controllers\ClientManagement\ClientPortalAgreementController;
use App\Http\Controllers\ClientManagement\ClientPortalController;
use App\Http\Controllers\FinanceTool\FinanceAccountsController;
use App\Http\Controllers\FinanceTool\FinancePayslipController;
use App\Http\Controllers\LoginController;
use App\Http\Controllers\UserManagementController;
use App\Http\Controllers\UtilityBillTracker\UtilityAccountController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/login', function () {
    return view('login');
})->name('login');

Route::post('/login', [LoginController::class, 'login']);
Route::post('/login/dev', [LoginController::class, 'devLogin'])->name('login.dev');

Route::middleware('auth')->group(function () {
    Route::get('/dashboard', [App\Http\Controllers\DashboardController::class, 'index']);

    Route::get('/finance/rsu', function () {
        return view('finance.rsu');
    });

    Route::get('/finance/rsu/manage', function () {
        return view('finance.rsu-manage');
    });

    Route::get('/finance/rsu/add-grant', function () {
        return view('finance.rsu-add-grant');
    });

    Route::get('/finance/accounts', [FinanceAccountsController::class, 'index']);
    Route::get('/finance/payslips', [FinancePayslipController::class, 'index']);
    Route::get('/finance/payslips/entry', [FinancePayslipController::class, 'entry']);
    Route::get('/finance/schedule-c', function () {
        return view('finance.schedule-c');
    });
    Route::get('/finance/tags', function () {
        return view('finance.tags');
    });

    // New account-prefixed routes
    Route::get('/finance/account/all/transactions', [FinanceAccountsController::class, 'showAllTransactions']);
    Route::get('/finance/account/all/lots', [FinanceAccountsController::class, 'showAllLots']);
    Route::get('/finance/account/all/import', [FinanceAccountsController::class, 'showAllImportPage']);
    Route::get('/finance/account/{account_id}/transactions', [FinanceAccountsController::class, 'show'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/duplicates', [FinanceAccountsController::class, 'duplicates'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/linker', [FinanceAccountsController::class, 'linker'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/statements', [FinanceAccountsController::class, 'statements'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/lots', [FinanceAccountsController::class, 'lots'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/summary', [FinanceAccountsController::class, 'summary'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/maintenance', [FinanceAccountsController::class, 'maintenance'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/import', [FinanceAccountsController::class, 'showImportTransactionsPage'])->where('account_id', '[0-9]+');

    // Backward compat: 301 redirects from old URL structure to new /finance/account/{id}/{tab} routes
    Route::redirect('/finance/all-transactions', '/finance/account/all/transactions', 301);
    Route::get('/finance/{account_id}', fn ($account_id) => redirect("/finance/account/{$account_id}/transactions", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/summary', fn ($account_id) => redirect("/finance/account/{$account_id}/summary", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/statements', fn ($account_id) => redirect("/finance/account/{$account_id}/statements", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/lots', fn ($account_id) => redirect("/finance/account/{$account_id}/lots", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/maintenance', fn ($account_id) => redirect("/finance/account/{$account_id}/maintenance", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/duplicates', fn ($account_id) => redirect("/finance/account/{$account_id}/duplicates", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/linker', fn ($account_id) => redirect("/finance/account/{$account_id}/linker", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/import-transactions', fn ($account_id) => redirect("/finance/account/{$account_id}/import", 301))->where('account_id', '[0-9]+');

    Route::get('/tools/license-manager', function () {
        return view('tools.license-manager');
    });

    // User Management Routes (Admin only)
    Route::get('/admin/users', [UserManagementController::class, 'index'])->name('admin.users');

    // Client Management Routes
    Route::get('/client/mgmt', [ClientCompanyController::class, 'index'])->name('client-management.index');
    Route::get('/client/mgmt/new', [ClientCompanyController::class, 'create'])->name('client-management.create');
    Route::post('/client/mgmt', [ClientCompanyController::class, 'store'])->name('client-management.store');
    Route::get('/client/mgmt/{id}', [ClientCompanyController::class, 'show'])->name('client-management.show');
    Route::delete('/client/mgmt/{id}', [ClientCompanyController::class, 'destroy'])->name('client-management.destroy');

    // Agreement Management Routes (Admin)
    Route::post('/client/mgmt/agreement', [ClientAgreementController::class, 'store'])->name('client-management.agreement.store');
    Route::get('/client/mgmt/agreement/{id}', [ClientAgreementController::class, 'show'])->name('client-management.agreement.show');

    // Client Portal Routes
    Route::get('/client/portal/{slug}', [ClientPortalController::class, 'index'])->name('client-portal.index');
    Route::get('/client/portal/{slug}/time', [ClientPortalController::class, 'time'])->name('client-portal.time');
    Route::get('/client/portal/{slug}/project/{projectSlug}', [ClientPortalController::class, 'project'])->name('client-portal.project');
    Route::get('/client/portal/{slug}/agreement/{agreementId}', [ClientPortalAgreementController::class, 'show'])->name('client-portal.agreement');
    Route::get('/client/portal/{slug}/invoices', [ClientPortalController::class, 'invoices'])->name('client-portal.invoices');
    Route::get('/client/portal/{slug}/invoice/{invoiceId}', [ClientPortalController::class, 'invoice'])->name('client-portal.invoice');
    Route::get('/client/portal/{slug}/expenses', [ClientPortalController::class, 'expenses'])->name('client-portal.expenses');

    // Utility Bill Tracker Routes
    Route::get('/utility-bill-tracker', [UtilityAccountController::class, 'index'])->name('utility-bill-tracker.index');
    Route::get('/utility-bill-tracker/{id}/bills', [UtilityAccountController::class, 'bills'])->name('utility-bill-tracker.bills');
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
