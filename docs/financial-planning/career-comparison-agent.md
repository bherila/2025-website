# Career Comparison — Agent Access

AI clients (Claude, Codex, generic MCP/HTTP clients) can read and edit Career Comparison scenarios through the Agent API. This doc covers what an agent can do, how to connect one, and the privacy rules that apply. For the overall token model, capability-filtered discovery, and TOON content negotiation, see [docs/agent-access.md](../agent-access.md).

---

## What the agent can do

### Anonymous (no token) — read-only

Anyone, including an unauthenticated agent, can:

- **Read a public share**: `GET /api/agent/v1/career-comparison/shares/{code}` — returns the shared scenario with the creator's redaction settings applied (when the creator unchecked "include my current job", current-job data is redacted). Expired or unknown share codes return `404`.
- **Run the calculator**: `POST /api/agent/v1/career-comparison/compute` — stateless projection of a submitted scenario (throttled to 60 requests/minute).

Anonymous access is strictly read/compute. The web app's anyone-with-the-link share *editing* is deliberately **not** exposed through the agent API.

### Authenticated (bearer token)

With a `career-comparison`-scoped agent token (and the `financial-planning.career-comparison.private` permission):

```text
GET    /api/agent/v1/career-comparison/latest            read your private latest scenario
PUT    /api/agent/v1/career-comparison/latest            save your private latest scenario
POST   /api/agent/v1/career-comparison/share             fork the scenario into a share link
PATCH  /api/agent/v1/career-comparison/shares/{code}     update share expiration (creator only)
DELETE /api/agent/v1/career-comparison/shares/{code}     delete a share (creator only)
POST   /api/agent/v1/career-comparison/import-rsu        import RSU grants into the current job (requires finance.rsu.view)
```

These delegate to the same workflow service and validation the web UI uses; share redaction and expiration behave identically.

### MCP

A minimal MCP server is mounted at `POST /mcp/career-comparison` (bearer auth) with intent-style tools:

| Tool | Description |
|------|-------------|
| `career_get_public_share` | Read a public share by code (redacted, expired → not found) |
| `career_get_latest_comparison` | Read your private latest scenario |
| `career_save_latest_comparison` | Save your private latest scenario |
| `career_import_rsu` | Import current RSU grants from the finance module |

`tools/list` is filtered by your permissions and the token's module scope; hidden tools are also uninvokable.

---

## Copy-paste setup

1. Log in and open **Financial Planning → Career Comparison**.
2. In the **Agent access** section at the bottom of the home column, use the **Agent Access (AI clients)** card:
   - **Copy Claude setup** — issues a temporary 4-hour `career-comparison`-scoped token and copies an MCP client config (with the token embedded) for `~/.config/claude/mcp.json` / `.mcp.json`.
   - **Copy REST/TOON setup** — copies a curl snippet against `GET /api/agent/v1/career-comparison/capabilities.toon` with `Accept: text/toon`.
3. Manage or revoke tokens any time from **My Account → Agent API Tokens**.

The token scope is the intersection of the module's permission list (`financial-planning.career-comparison.private`, `finance.rsu.view`) and your own effective permissions — it can never grant more than you already have.

## Prompt guidance (prefer TOON)

Agents should request and submit data as [TOON](https://github.com/toon-format/toon) (`Accept: text/toon`, `Content-Type: text/toon`) — it is markedly more compact than JSON for the tabular vesting/cash-flow data this module returns, which keeps more of the scenario in the model's context. Example instruction to give your agent:

> Fetch my latest career comparison with `Accept: text/toon`, summarize the lifetime-value deltas between offers, then propose edits as a TOON `PUT /career-comparison/latest` body for my approval before saving.

## Privacy

- Anonymous agent access is read-only and limited to public shares and stateless compute; creator redaction (`share_includes_current=false`) and expiration are always enforced.
- This surface never uploads documents of any kind — there is no file field anywhere in the Career Comparison agent API, and (as everywhere in the Agent API) **the CPA return PDF is never uploaded**; offer letters and other documents stay on your machine.
- Raw tokens are shown once at creation, stored hashed, and expire automatically (4 hours by default).
