<?php

use App\Http\Middleware\AuthenticateMcpRequest;
use App\Mcp\Servers\Finance;
use Laravel\Mcp\Facades\Mcp;

/**
 * MCP Server Routes
 *
 * Local (stdio) transport — used by `php artisan mcp:start finance`
 * for Claude Code / GitHub Copilot agent stdio mode.
 */
Mcp::local('finance', Finance::class);

/**
 * HTTP transport — used by remote MCP clients (e.g. production Claude Desktop config).
 * Requests must carry an `Authorization: Bearer <mcp_api_key_or_agent_token>` header.
 *
 * The AuthenticateMcpRequest middleware sets the authenticated user
 * statelessly so all per-user model scopes work correctly.
 */
Mcp::web('/mcp/finance', Finance::class)->middleware(AuthenticateMcpRequest::class);
