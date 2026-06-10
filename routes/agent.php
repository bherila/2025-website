<?php

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
