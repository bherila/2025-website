# Agent Access (MCP + REST/OpenAPI + TOON)

The Agent API lets users connect AI clients (Claude, Codex, generic MCP/HTTP clients) to selected modules of the app — **Finance**, **Tax**, and **Career Comparison** — with capability-filtered discovery and short-lived, module-scoped tokens.

---

## Concepts

### Modules

A *module* is the unit of token scoping. Valid modules: `finance`, `tax`, `career-comparison`. Each module maps to a fixed list of feature permissions (`app/Support/Agent/ModuleScope.php`); a token scoped to a module can never grant more than that list, and the list is further **intersected with the user's effective permissions at token-creation time**. `finance.rules.manage` and `finance.config.manage` are deliberately excluded from agent token scope.

### Tokens

Agent tokens live in the `agent_api_tokens` table (multi-record, per user):

- Raw tokens look like `bha_<64 hex chars>` and are stored **hashed only** (`sha256`); the raw value is returned exactly once at creation and never logged.
- **Quick-setup tokens** (the UI happy path) are module-scoped and expire after 4 hours by default (TTL clamps to 5–1440 minutes). Creating a new quick-setup token for the same (user, module, client) revokes the previous one.
- Persistent/automation tokens are supported by the data model for advanced use.
- Legacy `users.mcp_api_key` bearer keys continue to work everywhere agent tokens do (unscoped, tied to the user's live permissions).

Access checks are always the intersection of three things: the user's current effective permissions (`FeatureAccess`), the token's `allowed_permissions` scope, and the capability's required permission. Token scopes only ever shrink access — including for admins. Revoking a permission from a user immediately revokes agent access even for unexpired tokens.

### Capability-filtered discovery

Discovery surfaces (MCP `tools/list`, OpenAPI, capability manifests) **omit** anything the caller cannot use. Direct calls to a hidden capability still fail hard: `401` unauthenticated, `403` denied.

---

## Getting connected (UI happy path)

1. Open the module's page (e.g. **Finance → Config**) and find the **Agent Access (AI clients)** card.
2. Click **Copy Claude setup** (MCP JSON config) or **Copy REST/TOON setup** (curl snippet). The card transparently issues a temporary 4-hour module-scoped token and copies a ready-to-paste snippet — with the raw token embedded — to your clipboard.
3. Manage or revoke tokens any time from **My Account → Agent API Tokens**.

The snippet templates live in `resources/js/components/agent/clientTemplates.ts`; the reusable card is `resources/js/components/agent/AgentAccessCard.tsx`.

### Setup-token endpoints (browser session, not bearer)

These are called by the logged-in web UI (session + CSRF):

```text
POST   /api/agent/setup-tokens          {module, client?, ttl_minutes?}  → raw token (shown once) + setup URLs
GET    /api/agent/setup-tokens          → active tokens (prefix + metadata only, never hashes)
DELETE /api/agent/setup-tokens/{id}     → revoke (owner only)
```

---

## Transports

### MCP

Per-module MCP servers are mounted over HTTP (streamable) with bearer auth:

```text
POST /mcp/finance
```

(`/mcp/tax` and `/mcp/career-comparison` are minimal servers added with their modules.) `tools/list` is filtered per user **and** per token scope; hidden tools are also uninvokable. The stdio transport (`php artisan mcp:start finance`) for local development is unaffected by filtering.

### REST + OpenAPI

All REST endpoints live under `/api/agent/v1/...` (stateless bearer auth — no session, no CSRF):

```text
GET /api/agent/v1/me                              → {authenticated, user, token, permissions}
GET /api/agent/v1/capabilities[.toon]             → capability manifest (all modules)
GET /api/agent/v1/{module}/capabilities[.toon]    → per-module manifest
GET /api/agent/v1/openapi.json                    → filtered OpenAPI 3.1 document
```

Discovery endpoints accept anonymous requests and then return only public capabilities. The OpenAPI document includes vendor extensions (`x-bh-module`, `x-bh-capability`, `x-bh-required-permission`, `x-bh-risk`, `x-bh-mcp-tool`, `x-bh-output-formats`).

### TOON content negotiation

Every `/api/agent/v1` endpoint speaks JSON (default) and [TOON](https://github.com/toon-format/toon):

- **Request**: send `Content-Type: text/toon` with a TOON body (lenient decode); malformed TOON → `422`. JSON works as usual; other content types with a body → `415`.
- **Response**: send `Accept: text/toon` or append `?format=toon`; `?format=json` forces JSON.

Example discovery call:

```bash
curl -H 'Authorization: Bearer bha_…' \
  -H 'Accept: text/toon' \
  'https://your-domain.com/api/agent/v1/finance/capabilities.toon'
```

---

## Security properties

- Tokens hashed at rest; raw value shown once; prefix-only listings.
- Expiry and revocation enforced on every request; `last_used_at` tracked.
- Scope = module map ∩ user permissions at creation, re-checked against live permissions at request time.
- Anonymous access is read-only and limited to explicitly public capabilities (e.g. public Career Comparison shares).
- Writes respect accounting period locks (partnership basis today); unlocking requires a reason via the existing endpoints.

## Related docs

- [docs/finance/mcp-server.md](finance/mcp-server.md) — Finance MCP server tools/resources and client config.
- `.mcp.example.json` — example MCP client configuration (stdio + HTTP).
- `.claude/skills/finance-mcp.md` — Claude Code skill for the finance MCP tools.
