import {
  claudeMcpSetupSnippet,
  moduleLabel,
  restToonSetupSnippet,
  type SetupTokenResponse,
} from '@/components/agent/clientTemplates';

const setup: SetupTokenResponse = {
  token: 'bha_0123456789abcdef',
  token_prefix: 'bha_01234567',
  expires_at: '2026-06-10T16:00:00+00:00',
  module: 'finance',
  client: 'claude',
  mcp_url: 'https://example.test/mcp/finance',
  capabilities_url: 'https://example.test/api/agent/v1/finance/capabilities.toon',
  openapi_url: 'https://example.test/api/agent/v1/openapi.json',
};

describe('moduleLabel', () => {
  it('maps known modules to display labels', () => {
    expect(moduleLabel('finance')).toBe('Finance');
    expect(moduleLabel('career-comparison')).toBe('Career Comparison');
    expect(moduleLabel('tax')).toBe('Tax');
  });

  it('title-cases unknown hyphenated modules', () => {
    expect(moduleLabel('some-new-module')).toBe('Some New Module');
  });
});

describe('claudeMcpSetupSnippet', () => {
  it('produces valid JSON with the token embedded as a bearer header', () => {
    const snippet = claudeMcpSetupSnippet(setup);
    const parsed = JSON.parse(snippet);
    expect(parsed).toEqual({
      mcpServers: {
        'bh-finance': {
          url: 'https://example.test/mcp/finance',
          headers: { Authorization: 'Bearer bha_0123456789abcdef' },
        },
      },
    });
  });

  it('names the server after the module', () => {
    const snippet = claudeMcpSetupSnippet({ ...setup, module: 'tax', mcp_url: 'https://example.test/mcp/tax' });
    expect(Object.keys(JSON.parse(snippet).mcpServers)).toEqual(['bh-tax']);
  });
});

describe('restToonSetupSnippet', () => {
  it('builds a curl command against the module capabilities.toon with Accept: text/toon', () => {
    const snippet = restToonSetupSnippet(setup);
    expect(snippet).toContain("curl -H 'Authorization: Bearer bha_0123456789abcdef'");
    expect(snippet).toContain("-H 'Accept: text/toon'");
    expect(snippet).toContain("'https://example.test/api/agent/v1/finance/capabilities.toon'");
  });
});
