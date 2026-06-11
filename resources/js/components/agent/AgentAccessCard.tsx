import React, { useState } from 'react'

import {
  claudeMcpSetupSnippet,
  moduleLabel,
  restToonSetupSnippet,
  type SetupTokenResponse,
} from '@/components/agent/clientTemplates'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchWrapper } from '@/fetchWrapper'

interface AgentAccessCardProps {
  module: string
  defaultTtlMinutes?: number
}

type SnippetKind = 'claude' | 'rest'

interface IssuedTokenStatus {
  kind: SnippetKind
  expiresAt: string | null
}

interface SetupSnippetFallback {
  kind: SnippetKind
  snippet: string
  expiresAt: string | null
}

const formatExpiry = (value: string | null): string => {
  if (!value) return 'never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'never' : date.toLocaleString()
}

const writeToClipboard = async (text: string) => {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard access is unavailable')
  }

  await navigator.clipboard.writeText(text)
}

/**
 * Reusable module setup card: issues a temporary module-scoped agent token
 * and copies a ready-to-paste client snippet to the clipboard. If browser
 * clipboard access fails after token creation, the snippet is shown once so
 * the user can manually copy the active credential before leaving the page.
 */
export const AgentAccessCard: React.FC<AgentAccessCardProps> = ({ module, defaultTtlMinutes = 240 }) => {
  const [issuing, setIssuing] = useState<SnippetKind | null>(null)
  const [status, setStatus] = useState<IssuedTokenStatus | null>(null)
  const [fallback, setFallback] = useState<SetupSnippetFallback | null>(null)
  const [error, setError] = useState<string | null>(null)

  const label = moduleLabel(module)

  const copySetup = async (kind: SnippetKind) => {
    setIssuing(kind)
    setError(null)
    setStatus(null)
    setFallback(null)
    try {
      const setup = (await fetchWrapper.post('/api/agent/setup-tokens', {
        module,
        client: kind === 'claude' ? 'claude' : 'generic',
        ttl_minutes: defaultTtlMinutes,
      })) as SetupTokenResponse
      const snippet = kind === 'claude' ? claudeMcpSetupSnippet(setup) : restToonSetupSnippet(setup)
      try {
        await writeToClipboard(snippet)
      } catch {
        setFallback({ kind, snippet, expiresAt: setup.expires_at })
        setError('Clipboard access failed. Copy the active setup snippet below before leaving this page.')
        return
      }
      setStatus({ kind, expiresAt: setup.expires_at })
    } catch (err: unknown) {
      const message =
        typeof err === 'string' ? err : err instanceof Error ? err.message : 'Failed to create agent setup token'
      setError(message)
    } finally {
      setIssuing(null)
    }
  }

  const copyFallback = async () => {
    if (!fallback) return

    setError(null)
    try {
      await writeToClipboard(fallback.snippet)
      setStatus({ kind: fallback.kind, expiresAt: fallback.expiresAt })
      setFallback(null)
    } catch {
      setError('Clipboard access is still unavailable. Select the setup snippet and copy it manually.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Access (AI clients)</CardTitle>
        <CardDescription>
          Connect Claude, Codex, or other AI clients to the {label} module. Each button issues a temporary{' '}
          {label}-scoped token and copies a ready-to-paste setup snippet to your clipboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => copySetup('claude')} disabled={issuing !== null}>
            {issuing === 'claude' ? 'Issuing token…' : 'Copy Claude setup'}
          </Button>
          <Button variant="outline" onClick={() => copySetup('rest')} disabled={issuing !== null}>
            {issuing === 'rest' ? 'Issuing token…' : 'Copy REST/TOON setup'}
          </Button>
        </div>
        {status && (
          <p className="text-sm text-muted-foreground" data-testid="agent-access-status">
            Copied to clipboard. Scoped to {label} · expires {formatExpiry(status.expiresAt)} · Refresh / Revoke in
            Settings
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" data-testid="agent-access-error">
            {error}
          </p>
        )}
        {fallback && (
          <div className="space-y-2">
            <textarea
              className="min-h-36 w-full rounded-md border bg-muted/40 p-3 font-mono text-xs text-foreground"
              data-testid="agent-access-fallback-snippet"
              readOnly
              value={fallback.snippet}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copyFallback}>
                Retry copy
              </Button>
              <span className="text-xs text-muted-foreground">
                Token expires {formatExpiry(fallback.expiresAt)}. This snippet is not shown again after you leave.
              </span>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Tokens are scoped to {label} permissions only, expire automatically after{' '}
          {Math.round((defaultTtlMinutes / 60) * 10) / 10} hours, and can be revoked any time from My Account → Agent
          API Tokens. The raw token is embedded in the copied snippet and is not shown again.
        </p>
      </CardContent>
    </Card>
  )
}

export default AgentAccessCard
