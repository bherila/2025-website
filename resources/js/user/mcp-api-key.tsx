import React, { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchWrapper } from '@/fetchWrapper';

interface McpApiKeySectionProps {
  hasMcpApiKey: boolean;
  onSuccess: (message: string) => void;
  onError: (field: string, message: string) => void;
  onUserUpdate: () => void;
}

export const McpApiKeySection: React.FC<McpApiKeySectionProps> = ({
  hasMcpApiKey,
  onSuccess,
  onError,
  onUserUpdate,
}) => {
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generateKey = async () => {
    setLoading(true);
    setNewKey(null);
    try {
      const data = (await fetchWrapper.post('/api/user/generate-mcp-api-key', {})) as {
        message: string;
        mcp_api_key: string;
      };
      setNewKey(data.mcp_api_key);
      onSuccess(data.message);
      onUserUpdate();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate MCP API key';
      onError('mcpApiKey', message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (newKey) {
      await navigator.clipboard.writeText(newKey);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>MCP API Key</CardTitle>
        <CardDescription>
          Used to authenticate the BH Finance MCP server from Claude Code or other MCP clients.
          {' '}
          Status:{' '}
          {hasMcpApiKey ? '✅ Key is set' : '⚠️ No key generated yet'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {newKey && (
          <Alert>
            <AlertDescription>
              <p className="font-semibold mb-1">Your new MCP API key (copy it now — it will not be shown again):</p>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-sm font-mono">{newKey}</code>
                <Button variant="outline" size="sm" onClick={copyToClipboard}>
                  Copy
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground">
          Regenerating a key immediately invalidates the previous one. Update your MCP client configuration after regenerating.
        </p>
        <Button onClick={generateKey} disabled={loading}>
          {loading ? 'Generating…' : hasMcpApiKey ? 'Regenerate MCP API Key' : 'Generate MCP API Key'}
        </Button>
      </CardContent>
    </Card>
  );
};
