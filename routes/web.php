<?php

use App\Http\Controllers\AddressLabelController;
use App\Http\Controllers\AdminGenAiJobsWebController;
use App\Http\Controllers\AdminTaxNormalizationWebController;
use App\Http\Controllers\BingoController;
use App\Http\Controllers\ClientManagement\ClientAgreementController;
use App\Http\Controllers\ClientManagement\ClientCompanyController;
use App\Http\Controllers\ClientManagement\ClientPortalAgreementController;
use App\Http\Controllers\ClientManagement\ClientPortalController;
use App\Http\Controllers\ClientManagement\ClientPortalProposalController;
use App\Http\Controllers\ClientManagement\ClientProposalController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\Finance\TaxPreviewController;
use App\Http\Controllers\FinanceTool\FinanceAccountsController;
use App\Http\Controllers\FinanceTool\FinancePayslipController;
use App\Http\Controllers\FinanceTool\TaxDocumentLotReconciliationPageController;
use App\Http\Controllers\FinanceTool\TaxReturnPdfExportController;
use App\Http\Controllers\FinanceTool\TaxReturnPdfExportOptionsController;
use App\Http\Controllers\FinancialPlanning\CareerCompController;
use App\Http\Controllers\FinancialPlanning\RothConversionController;
use App\Http\Controllers\LoginController;
use App\Http\Controllers\MD\MarkdownRendererController;
use App\Http\Controllers\OhifViewerController;
use App\Http\Controllers\PHR\PageController as PHRPageController;
use App\Http\Controllers\PHR\PhrDocumentController;
use App\Http\Controllers\PHR\PhrExportController;
use App\Http\Controllers\RecipeController;
use App\Http\Controllers\Toon\ToonConverterController;
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
Route::post('/login/dev-by-id', [LoginController::class, 'devLoginById'])->name('login.dev.by-id');

Route::middleware('auth')->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'index']);

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
    Route::get('/finance/documents', function () {
        return view('finance.documents');
    });
    Route::get('/finance/payslips', [FinancePayslipController::class, 'index']);
    Route::get('/finance/payslips/entry', [FinancePayslipController::class, 'entry']);
    Route::get('/finance/tax-preview', [TaxPreviewController::class, 'show']);
    Route::get('/finance/tax-preview/pdf-export-options', TaxReturnPdfExportOptionsController::class);
    Route::post('/finance/tax-preview/export-pdf', [TaxReturnPdfExportController::class, 'export']);
    Route::get('/finance/tax-documents/{id}/lot-reconciliation', [TaxDocumentLotReconciliationPageController::class, 'show'])->where('id', '[0-9]+');
    // Backward compat redirect for old Schedule C URL
    Route::redirect('/finance/schedule-c', '/finance/tax-preview', 301);
    Route::get('/finance/tags', function () {
        return view('finance.tags');
    });
    Route::get('/finance/config', function () {
        return view('finance.config');
    });

    // New account-prefixed routes
    Route::get('/finance/account/all/transactions', [FinanceAccountsController::class, 'showAllTransactions']);
    Route::get('/finance/account/all/lots', [FinanceAccountsController::class, 'showAllLots']);
    Route::get('/finance/account/all/fees', [FinanceAccountsController::class, 'showAllFees']);
    Route::get('/finance/account/all/import', [FinanceAccountsController::class, 'showAllImportPage']);
    Route::get('/finance/account/{account_id}/transactions', [FinanceAccountsController::class, 'show'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/duplicates', [FinanceAccountsController::class, 'duplicates'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/linker', [FinanceAccountsController::class, 'linker'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/statements', [FinanceAccountsController::class, 'statements'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/lots', [FinanceAccountsController::class, 'lots'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/summary', [FinanceAccountsController::class, 'summary'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/fees', [FinanceAccountsController::class, 'fees'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/basis', [FinanceAccountsController::class, 'basis'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/maintenance', [FinanceAccountsController::class, 'maintenance'])->where('account_id', '[0-9]+');
    Route::get('/finance/account/{account_id}/import', [FinanceAccountsController::class, 'showImportTransactionsPage'])->where('account_id', '[0-9]+');

    // Backward compat: 301 redirects from old URL structure to new /finance/account/{id}/{tab} routes
    Route::redirect('/finance/all-transactions', '/finance/account/all/transactions', 301);
    Route::get('/finance/{account_id}', fn ($account_id) => redirect("/finance/account/{$account_id}/transactions", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/summary', fn ($account_id) => redirect("/finance/account/{$account_id}/summary", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/fees', fn ($account_id) => redirect("/finance/account/{$account_id}/fees", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/basis', fn ($account_id) => redirect("/finance/account/{$account_id}/basis", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/statements', fn ($account_id) => redirect("/finance/account/{$account_id}/statements", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/lots', fn ($account_id) => redirect("/finance/account/{$account_id}/lots", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/maintenance', fn ($account_id) => redirect("/finance/account/{$account_id}/maintenance", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/duplicates', fn ($account_id) => redirect("/finance/account/{$account_id}/duplicates", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/linker', fn ($account_id) => redirect("/finance/account/{$account_id}/linker", 301))->where('account_id', '[0-9]+');
    Route::get('/finance/{account_id}/import-transactions', fn ($account_id) => redirect("/finance/account/{$account_id}/import", 301))->where('account_id', '[0-9]+');

    Route::get('/tools/license-manager', function () {
        return view('tools.license-manager');
    });
    Route::get('/tools/class-action-tracker', function () {
        return view('tools.class-action-tracker');
    })->name('tools.class-action-tracker');
    Route::get('/phr', [PHRPageController::class, 'index'])->name('phr.index');
    Route::get('/phr/patients', [PHRPageController::class, 'patients'])->name('phr.patients');
    Route::get('/phr/patients/manage', [PHRPageController::class, 'managePatients'])->name('phr.patients.manage');
    Route::get('/phr/imports', [PHRPageController::class, 'imports'])->name('phr.imports');
    Route::get('/phr/config', [PHRPageController::class, 'config'])->name('phr.config');
    Route::get('/phr/patient/{patient}', [PHRPageController::class, 'patient'])
        ->whereNumber('patient')
        ->name('phr.patient');

    // User Management Routes (Admin only)
    Route::get('/admin/users', [UserManagementController::class, 'index'])->name('admin.users');

    // Admin GenAI Jobs (Admin only)
    Route::get('/admin/genai-jobs', [AdminGenAiJobsWebController::class, 'index'])->name('admin.genai-jobs');

    // Admin Tax Normalization Review (Admin only)
    Route::get('/admin/tax-normalization-review', [AdminTaxNormalizationWebController::class, 'index'])->name('admin.tax-normalization-review');

    // Client Management Routes
    Route::get('/client/mgmt', [ClientCompanyController::class, 'index'])->name('client-management.index');
    Route::get('/client/mgmt/new', [ClientCompanyController::class, 'create'])->name('client-management.create');
    // Must be declared before the `/client/mgmt/{id}` catch-all so "invoices" isn't treated as a company id.
    Route::get('/client/mgmt/invoices', [ClientCompanyController::class, 'invoicesIndex'])->name('client-management.invoices');
    Route::post('/client/mgmt', [ClientCompanyController::class, 'store'])->name('client-management.store');
    Route::get('/client/mgmt/{id}', [ClientCompanyController::class, 'show'])->name('client-management.show');
    Route::delete('/client/mgmt/{id}', [ClientCompanyController::class, 'destroy'])->name('client-management.destroy');

    // Agreement Management Routes (Admin)
    Route::post('/client/mgmt/agreement', [ClientAgreementController::class, 'store'])->name('client-management.agreement.store');
    Route::get('/client/mgmt/agreement/{id}', [ClientAgreementController::class, 'show'])->name('client-management.agreement.show');

    // Proposal Management Routes (Admin)
    Route::post('/client/mgmt/proposal', [ClientProposalController::class, 'store'])->name('client-management.proposal.store');
    Route::get('/client/mgmt/proposal/{id}', [ClientProposalController::class, 'show'])->name('client-management.proposal.show');

    // Client Portal Routes
    Route::get('/client/portal/{slug}', [ClientPortalController::class, 'index'])->name('client-portal.index');
    Route::get('/client/portal/{slug}/time', [ClientPortalController::class, 'time'])->name('client-portal.time');
    Route::get('/client/portal/{slug}/project/{projectSlug}', [ClientPortalController::class, 'project'])->name('client-portal.project');
    Route::get('/client/portal/{slug}/agreement/{agreementId}', [ClientPortalAgreementController::class, 'show'])->name('client-portal.agreement');
    Route::get('/client/portal/{slug}/proposals', [ClientPortalProposalController::class, 'index'])->name('client-portal.proposals');
    Route::get('/client/portal/{slug}/proposal/{proposalId}', [ClientPortalProposalController::class, 'show'])->name('client-portal.proposal');
    Route::get('/client/portal/{slug}/invoices', [ClientPortalController::class, 'invoices'])->name('client-portal.invoices');
    Route::get('/client/portal/{slug}/billing', [ClientPortalController::class, 'billing'])->name('client-portal.billing');
    Route::get('/client/portal/{slug}/invoice/{invoiceId}', [ClientPortalController::class, 'invoice'])->name('client-portal.invoice');
    Route::get('/client/portal/{slug}/expenses', [ClientPortalController::class, 'expenses'])->name('client-portal.expenses');

    // Utility Bill Tracker Routes
    Route::get('/utility-bill-tracker', [UtilityAccountController::class, 'index'])->name('utility-bill-tracker.index');
    Route::get('/utility-bill-tracker/{id}/bills', [UtilityAccountController::class, 'bills'])->name('utility-bill-tracker.bills');
});

Route::get('/tools/bingo', [BingoController::class, 'index']);

Route::get('/games/parking-pickup', function () {
    return view('games.cars');
})->name('games.parking-pickup');

Route::get('/games/marble-sort', function () {
    return view('games.marble-sort');
})->name('games.marble-sort');

Route::get('/tools/irs-f461', function () {
    return view('tools.irs-f461');
});

Route::get('/tools/markdown', [MarkdownRendererController::class, 'show'])
    ->name('tools.markdown');
Route::get('/tools/markdown/s/{code}', [MarkdownRendererController::class, 'showByCode'])
    ->name('tools.markdown.shared');

Route::get('/tools/toon-json', [ToonConverterController::class, 'show'])
    ->name('tools.toon-json');
Route::get('/tools/toon-json/s/{code}', [ToonConverterController::class, 'showByCode'])
    ->name('tools.toon-json.shared');

Route::get('/tools/address-labels', [AddressLabelController::class, 'index'])->name('tools.address-labels.index');
Route::post('/tools/address-labels/pdf', [AddressLabelController::class, 'generate'])->name('tools.address-labels.pdf');
Route::post('/tools/address-labels/preview', [AddressLabelController::class, 'preview'])->name('tools.address-labels.preview');
Route::get('/tools/address-labels/calibration', [AddressLabelController::class, 'calibration'])->name('tools.address-labels.calibration');

Route::get('/ohif', OhifViewerController::class)->name('ohif.index');
Route::get('/ohif/viewer/{path?}', OhifViewerController::class)
    ->where('path', '.*')
    ->name('ohif.viewer');

Route::get('/financial-planning', function () {
    return view('financial-planning.index');
});

Route::get('/financial-planning/retirement-contribution-calculator', function () {
    return view('financial-planning.retirement-contribution-calculator');
});

Route::get('/financial-planning/rent-vs-buy', function () {
    return view('financial-planning.rent-vs-buy');
})->name('financial-planning.rent-vs-buy');

Route::get('/financial-planning/roth-conversion', [RothConversionController::class, 'show'])
    ->name('financial-planning.roth-conversion');
Route::get('/financial-planning/roth-conversion/s/{code}', [RothConversionController::class, 'showByCode'])
    ->name('financial-planning.roth-conversion.shared');
Route::get('/financial-planning/career-comparison', [CareerCompController::class, 'show'])
    ->name('financial-planning.career-comparison');
Route::get('/financial-planning/career-comparison/s/{code}', [CareerCompController::class, 'showByCode'])
    ->name('financial-planning.career-comparison.shared');
Route::redirect('/financial-planning/opportunity-cost', '/financial-planning/career-comparison', 301);
Route::get('/financial-planning/opportunity-cost/s/{code}', fn (string $code) => redirect("/financial-planning/career-comparison/s/{$code}", 301));

Route::get('/recipes', [RecipeController::class, 'index'])->name('recipes.index');
Route::get('/recipes/{slug}', [RecipeController::class, 'show'])->name('recipes.show');

Route::get('/projects', function () {
    return view('projects');
})->name('projects');

Route::middleware(['auth', 'signed'])->group(function (): void {
    Route::get('/phr/documents/{document}/download', [PhrDocumentController::class, 'download'])
        ->whereNumber('document')
        ->name('phr.documents.download');
    Route::get('/phr/exports/{export}/download', [PhrExportController::class, 'download'])
        ->whereNumber('export')
        ->name('phr.exports.download');
});
