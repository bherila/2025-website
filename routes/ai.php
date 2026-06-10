<?php

use App\Http\Middleware\AuthenticateAgentRequest;
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
 * Requests must carry an `Authorization: Bearer <token>` header — either an
 * agent_api_tokens quick-setup/persistent token or a legacy users.mcp_api_key.
 *
 * AuthenticateAgentRequest resolves the user statelessly (legacy keys keep
 * working via the AgentTokenService fallback) and binds an AgentContext so
 * tools/list discovery is filtered by feature permission AND token scope
 * (see App\Mcp\Support\FiltersByFeature).
 */
Mcp::web('/mcp/finance', Finance::class)->middleware(AuthenticateAgentRequest::class);
