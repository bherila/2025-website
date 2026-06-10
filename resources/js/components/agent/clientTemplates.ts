/**
 * Client setup snippet templates for the Agent API.
 *
 * All copy-to-clipboard snippet syntax lives here so client-format changes
 * (Claude MCP config shape, curl flags, etc.) never touch AgentAccessCard.
 * Raw tokens are interpolated transiently by callers and must never be
 * logged or persisted.
 */

export interface SetupTokenResponse {
  token: string
  token_prefix: string
  expires_at: string | null
  module: string
  client: string | null
  mcp_url: string
  capabilities_url: string
  openapi_url: string
}

const MODULE_LABELS: Record<string, string> = {
  finance: 'Finance',
  'career-comparison': 'Career Comparison',
  tax: 'Tax',
}

export function moduleLabel(module: string): string {
  return (
    MODULE_LABELS[module] ??
    module
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  )
}

/**
 * Claude (MCP) client config with the bearer token embedded, suitable for
 * pasting into ~/.config/claude/mcp.json / .mcp.json "mcpServers".
 */
export function claudeMcpSetupSnippet(setup: SetupTokenResponse): string {
  return JSON.stringify(
    {
      mcpServers: {
        [`bh-${setup.module}`]: {
          url: setup.mcp_url,
          headers: {
            Authorization: `Bearer ${setup.token}`,
          },
        },
      },
    },
    null,
    2,
  )
}

/**
 * REST/TOON discovery snippet: curl against the module capability manifest
 * with `Accept: text/toon`.
 */
export function restToonSetupSnippet(setup: SetupTokenResponse): string {
  return [
    `curl -H 'Authorization: Bearer ${setup.token}' \\`,
    `  -H 'Accept: text/toon' \\`,
    `  '${setup.capabilities_url}'`,
  ].join('\n')
}
