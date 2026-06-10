<?php

use App\Http\Controllers\Agent\AgentCapabilitiesController;
use App\Http\Controllers\Agent\AgentMeController;
use App\Http\Controllers\Agent\AgentOpenApiController;
use App\Http\Controllers\Agent\Finance\AgentFinanceAccountsController;
use App\Http\Controllers\Agent\Finance\AgentFinanceLotsController;
use App\Http\Controllers\Agent\Finance\AgentFinancePayslipsController;
use App\Http\Controllers\Agent\Finance\AgentFinanceTaxDocumentsController;
use App\Http\Controllers\Agent\Finance\AgentFinanceTaxPreviewController;
use App\Http\Controllers\Agent\Finance\AgentFinanceTransactionsController;
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
Route::middleware(AuthenticateAgentRequest::class)->prefix('finance')->name('finance.')->group(function (): void {
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
});
