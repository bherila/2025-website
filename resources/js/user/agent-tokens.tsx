import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { fetchWrapper } from '@/fetchWrapper';

interface AgentToken {
  id: number;
  name: string;
  token_prefix: string | null;
  module: string | null;
  purpose: string;
  client_hint: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string | null;
}

interface AgentTokensSectionProps {
  onSuccess: (message: string) => void;
  onError: (field: string, message: string) => void;
}

const formatDateTime = (value: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

const isExpired = (value: string | null): boolean => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
};

export const AgentTokensSection: React.FC<AgentTokensSectionProps> = ({ onSuccess, onError }) => {
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const fetchTokens = useCallback(async () => {
    try {
      const data = (await fetchWrapper.get('/api/agent/setup-tokens')) as { tokens: AgentToken[] };
      setTokens(data.tokens);
    } catch (err: unknown) {
      const message = typeof err === 'string' ? err : 'Failed to load agent tokens';
      onError('agentTokens', message);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const revokeToken = async (id: number) => {
    setRevokingId(id);
    try {
      await fetchWrapper.delete(`/api/agent/setup-tokens/${id}`, {});
      onSuccess('Agent token revoked.');
      setTokens((prev) => prev.filter((token) => token.id !== id));
    } catch (err: unknown) {
      const message = typeof err === 'string' ? err : 'Failed to revoke agent token';
      onError('agentTokens', message);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent API Tokens</CardTitle>
        <CardDescription>
          Temporary module-scoped tokens for connecting AI agents (Claude, Codex, etc.) to selected modules.
          Tokens are created from each module&apos;s setup card and expire automatically; revoke any token here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active agent tokens.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Token</th>
                  <th className="py-2 pr-4 font-medium">Module</th>
                  <th className="py-2 pr-4 font-medium">Client</th>
                  <th className="py-2 pr-4 font-medium">Expires</th>
                  <th className="py-2 pr-4 font-medium">Last used</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {token.token_prefix ?? '—'}…
                      </code>
                    </td>
                    <td className="py-2 pr-4">{token.module ?? '—'}</td>
                    <td className="py-2 pr-4">{token.client_hint ?? '—'}</td>
                    <td className="py-2 pr-4">
                      {formatDateTime(token.expires_at)}
                      {isExpired(token.expires_at) && (
                        <span className="ml-2 text-xs text-muted-foreground">(expired)</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{formatDateTime(token.last_used_at)}</td>
                    <td className="py-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => revokeToken(token.id)}
                        disabled={revokingId === token.id}
                      >
                        {revokingId === token.id ? 'Revoking…' : 'Revoke'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
