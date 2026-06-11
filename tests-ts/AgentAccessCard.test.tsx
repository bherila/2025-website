import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { AgentAccessCard } from '@/components/agent/AgentAccessCard';

const setupResponse = {
  token: 'bha_secret_raw_token',
  token_prefix: 'bha_secret_r',
  expires_at: '2026-06-10T16:00:00+00:00',
  module: 'finance',
  client: 'claude',
  mcp_url: 'https://example.test/mcp/finance',
  capabilities_url: 'https://example.test/api/agent/v1/finance/capabilities.toon',
  openapi_url: 'https://example.test/api/agent/v1/openapi.json',
};

describe('AgentAccessCard', () => {
  let clipboardWriteText: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '<meta name="csrf-token" content="test-csrf">';
    clipboardWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
    });
    (window as any).fetch = jest.fn();
  });

  const mockTokenCreation = () => {
    ((window as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: () => Promise.resolve(JSON.stringify(setupResponse)),
      json: () => Promise.resolve(setupResponse),
    });
  };

  it('renders both setup buttons', () => {
    render(<AgentAccessCard module="finance" />);
    expect(screen.getByText('Copy Claude setup')).toBeInTheDocument();
    expect(screen.getByText('Copy REST/TOON setup')).toBeInTheDocument();
  });

  it('issues a 4-hour finance token and copies the Claude MCP snippet', async () => {
    mockTokenCreation();
    render(<AgentAccessCard module="finance" />);

    fireEvent.click(screen.getByText('Copy Claude setup'));

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledTimes(1));

    const [url, options] = ((window as any).fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/agent/setup-tokens');
    expect(JSON.parse(options.body)).toEqual({ module: 'finance', client: 'claude', ttl_minutes: 240 });

    const snippet = clipboardWriteText.mock.calls[0][0] as string;
    const parsed = JSON.parse(snippet);
    expect(parsed.mcpServers['bh-finance'].headers.Authorization).toBe('Bearer bha_secret_raw_token');
  });

  it('copies a REST/TOON curl snippet with Accept: text/toon', async () => {
    mockTokenCreation();
    render(<AgentAccessCard module="finance" />);

    fireEvent.click(screen.getByText('Copy REST/TOON setup'));

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledTimes(1));

    expect(JSON.parse(((window as any).fetch as jest.Mock).mock.calls[0][1].body).client).toBe('generic');

    const snippet = clipboardWriteText.mock.calls[0][0] as string;
    expect(snippet).toContain("-H 'Accept: text/toon'");
    expect(snippet).toContain('https://example.test/api/agent/v1/finance/capabilities.toon');
    expect(snippet).toContain('Bearer bha_secret_raw_token');
  });

  it('shows the scoped/expires status line and never renders the raw token', async () => {
    mockTokenCreation();
    render(<AgentAccessCard module="finance" />);

    fireEvent.click(screen.getByText('Copy Claude setup'));

    const status = await screen.findByTestId('agent-access-status');
    expect(status.textContent).toContain('Scoped to Finance');
    expect(status.textContent).toContain('expires');
    expect(status.textContent).toContain('Refresh / Revoke in Settings');
    expect(document.body.textContent).not.toContain('bha_secret_raw_token');
  });

  it('respects a custom defaultTtlMinutes', async () => {
    mockTokenCreation();
    render(<AgentAccessCard module="finance" defaultTtlMinutes={60} />);

    fireEvent.click(screen.getByText('Copy Claude setup'));

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledTimes(1));
    expect(JSON.parse(((window as any).fetch as jest.Mock).mock.calls[0][1].body).ttl_minutes).toBe(60);
  });

  it('surfaces an error and does not copy when token creation fails', async () => {
    ((window as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve(JSON.stringify({ message: 'Forbidden' })),
    });
    render(<AgentAccessCard module="finance" />);

    fireEvent.click(screen.getByText('Copy Claude setup'));

    const error = await screen.findByTestId('agent-access-error');
    expect(error.textContent).toBeTruthy();
    expect(clipboardWriteText).not.toHaveBeenCalled();
  });
});
