<?php

use App\Http\Controllers\Agent\AgentCapabilitiesController;
use App\Http\Controllers\Agent\AgentMeController;
use App\Http\Controllers\Agent\AgentOpenApiController;
use App\Http\Controllers\Agent\CareerComparison\AgentCareerComparisonController;
use App\Http\Controllers\Agent\Finance\AgentFinanceAccountsController;
use App\Http\Controllers\Agent\Finance\AgentFinanceLotsController;
use App\Http\Controllers\Agent\Finance\AgentFinancePayslipsController;
use App\Http\Controllers\Agent\Finance\AgentFinanceTaxDocumentsController;
use App\Http\Controllers\Agent\Finance\AgentFinanceTaxPreviewController;
use App\Http\Controllers\Agent\Finance\AgentFinanceTransactionsController;
use App\Http\Controllers\Agent\Finance\FinanceDownloadController;
use App\Http\Controllers\Agent\Imports\AgentImportController;
use App\Http\Controllers\Agent\Tax\AgentTaxController;
use App\Http\Middleware\AuthenticateAgentRequest;
use App\Http\Middleware\OptionalAgentRequest;
use Illuminate\Support\Facades\Route;

/**
 * Agent API routes (/api/agent/v1).
 *
 * Stateless bearer-token surface for AI agents (MCP clients, REST/TOON).
 * Registered in bootstrap/app.php WITHOUT the `web` middleware group — no
 * session, no CSRF — and with NegotiatesAgentPayload applied to the whole
 * group for JSON/TOON content negotiation.
 */
Route::get('/ping', fn () => response()->json(['ok' => true]))->name('ping');

Route::middleware(OptionalAgentRequest::class)->group(function (): void {
    Route::get('/me', AgentMeController::class)->name('me');
    Route::get('/capabilities', [AgentCapabilitiesController::class, 'index'])->name('capabilities');
    Route::get('/capabilities.toon', [AgentCapabilitiesController::class, 'indexToon'])->name('capabilities.toon');
    Route::get('/openapi.json', AgentOpenApiController::class)->name('openapi');
    Route::get('/{module}/capabilities', [AgentCapabilitiesController::class, 'show'])
        ->whereIn('module', AgentCapabilitiesController::MODULES)
        ->name('module-capabilities');
    Route::get('/{module}/capabilities.toon', [AgentCapabilitiesController::class, 'showToon'])
        ->whereIn('module', AgentCapabilitiesController::MODULES)
        ->name('module-capabilities.toon');
});

/**
 * Finance read endpoints. Bearer auth first (AuthenticateAgentRequest), then
 * per-route feature permission — RequireFeaturePermission also enforces the
 * agent token's scope, so module-scoped tokens cannot reach other features.
 */
Route::middleware(AuthenticateAgentRequest::class.':finance')->prefix('finance')->name('finance.')->group(function (): void {
    Route::get('/accounts', AgentFinanceAccountsController::class)
        ->middleware('feature:finance.accounts.basic')
        ->name('accounts');
    Route::get('/transactions', AgentFinanceTransactionsController::class)
        ->middleware('feature:finance.transactions.view')
        ->name('transactions');
    Route::get('/tax-preview/{year}', AgentFinanceTaxPreviewController::class)
        ->whereNumber('year')
        ->middleware('feature:finance.tax-preview.view')
        ->name('tax-preview');
    Route::get('/tax-documents', [AgentFinanceTaxDocumentsController::class, 'index'])
        ->middleware('feature:finance.tax-documents.view')
        ->name('tax-documents');
    Route::get('/tax-documents/{id}', [AgentFinanceTaxDocumentsController::class, 'show'])
        ->whereNumber('id')
        ->middleware('feature:finance.tax-documents.view')
        ->name('tax-documents.show');
    Route::get('/lots', AgentFinanceLotsController::class)
        ->middleware('feature:finance.lots.view')
        ->name('lots');
    Route::get('/payslips', AgentFinancePayslipsController::class)
        ->middleware('feature:finance.payslips.view')
        ->name('payslips');
    Route::get('/tax-documents/{id}/download-url', [FinanceDownloadController::class, 'taxDocumentDownloadUrl'])
        ->whereNumber('id')
        ->middleware('feature:finance.tax-documents.view')
        ->name('tax-documents.download-url');
    Route::get('/documents/{id}/download-url', [FinanceDownloadController::class, 'documentDownloadUrl'])
        ->whereNumber('id')
        ->middleware('feature:finance.accounts.detail')
        ->name('documents.download-url');
});

/**
 * GenAI import wrappers. Job-type-specific permissions are enforced in the
 * controller via AgentContext (token scope applies); finance.access gates the
 * whole group. Agent tokens are restricted to finance job types.
 */
Route::middleware([AuthenticateAgentRequest::class.':finance', 'feature:finance.access'])->prefix('imports')->name('imports.')->group(function (): void {
    Route::post('/request-upload', [AgentImportController::class, 'requestUpload'])->name('request-upload');
    Route::post('/jobs', [AgentImportController::class, 'createJob'])->name('jobs.create');
    Route::get('/jobs', [AgentImportController::class, 'index'])->name('jobs');
    Route::get('/jobs/{id}', [AgentImportController::class, 'show'])->whereNumber('id')->name('jobs.show');
    Route::post('/jobs/{id}/retry', [AgentImportController::class, 'retry'])->whereNumber('id')->name('jobs.retry');
    Route::delete('/jobs/{id}', [AgentImportController::class, 'destroy'])->whereNumber('id')->name('jobs.delete');
});

/**
 * Career Comparison. Anonymous access is read-only (public share read +
 * stateless compute); the web app's anonymous share-edit (PUT s/{code}) is
 * deliberately NOT exposed. Private CRUD requires a career-comparison-scoped
 * bearer token plus financial-planning.career-comparison.private (import-rsu:
 * finance.rsu.view).
 */
Route::prefix('career-comparison')->name('career-comparison.')->group(function (): void {
    Route::middleware(OptionalAgentRequest::class)->group(function (): void {
        Route::get('/shares/{code}', [AgentCareerComparisonController::class, 'publicShare'])
            ->name('shares.show');
        Route::post('/compute', [AgentCareerComparisonController::class, 'compute'])
            ->middleware('throttle:60,1')
            ->name('compute');
    });

    Route::middleware(AuthenticateAgentRequest::class.':career-comparison')->group(function (): void {
        Route::get('/latest', [AgentCareerComparisonController::class, 'latest'])
            ->middleware('feature:financial-planning.career-comparison.private')
            ->name('latest');
        Route::put('/latest', [AgentCareerComparisonController::class, 'saveLatest'])
            ->middleware('feature:financial-planning.career-comparison.private')
            ->name('latest.save');
        Route::post('/share', [AgentCareerComparisonController::class, 'createShare'])
            ->middleware('feature:financial-planning.career-comparison.private')
            ->name('share');
        Route::patch('/shares/{code}', [AgentCareerComparisonController::class, 'updateShare'])
            ->middleware('feature:financial-planning.career-comparison.private')
            ->name('shares.update');
        Route::delete('/shares/{code}', [AgentCareerComparisonController::class, 'deleteShare'])
            ->middleware('feature:financial-planning.career-comparison.private')
            ->name('shares.delete');
        Route::post('/import-rsu', [AgentCareerComparisonController::class, 'importRsu'])
            ->middleware('feature:finance.rsu.view')
            ->name('import-rsu');
    });
});

/**
 * Tax reconciliation. Local-only CPA return line comparison — pure
 * computation, no document storage.
 */
Route::middleware(AuthenticateAgentRequest::class.':tax')->prefix('tax')->name('tax.')->group(function (): void {
    Route::post('/preview/{year}/compare-return-lines', [AgentTaxController::class, 'compareReturnLines'])
        ->whereNumber('year')
        ->middleware('feature:finance.tax-preview.view')
        ->name('compare-return-lines');
});
