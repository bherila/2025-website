<?php

use App\Http\Controllers\Agent\AgentCapabilitiesController;
use App\Http\Controllers\Agent\AgentMeController;
use App\Http\Controllers\Agent\AgentOpenApiController;
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
