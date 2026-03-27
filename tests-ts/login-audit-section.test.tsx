import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { LoginAuditSection } from '@/user/login-audit-section';

const mockOnError = jest.fn();

const mockAuditResponse = {
  data: [
    {
      id: 1,
      email: 'user@example.com',
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
      success: true,
      method: 'password',
      is_suspicious: false,
      created_at: '2024-01-15T10:30:00Z',
    },
    {
      id: 2,
      email: 'user@example.com',
      ip_address: '10.0.0.1',
      user_agent: 'Chrome',
      success: false,
      method: 'passkey',
      is_suspicious: false,
      created_at: '2024-01-14T09:00:00Z',
    },
  ],
  current_page: 1,
  last_page: 1,
  total: 2,
};

describe('LoginAuditSection', () => {
  let consoleErrorSpy: jest.SpyInstance
  beforeAll(() => {
    const originalConsoleError = console.error.bind(console)
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      if (typeof args[0] === 'string' && args[0].includes('inside a test was not wrapped in act')) {
        return
      }
      originalConsoleError(...args)
    })
  })
  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '<meta name="csrf-token" content="test-csrf">';
     
    (window as any).fetch = jest.fn();
  });

  it('shows loading state initially', () => {
     
    ((window as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockAuditResponse,
    });

    render(<LoginAuditSection onError={mockOnError} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty state when no entries', async () => {
     
    ((window as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], current_page: 1, last_page: 1, total: 0 }),
    });

    render(<LoginAuditSection onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('No login history found.')).toBeInTheDocument();
    });
  });

  it('displays login entries', async () => {
     
    ((window as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockAuditResponse,
    });

    render(<LoginAuditSection onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('192.168.1.1')).toBeInTheDocument();
      expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
    });
  });

  it('shows correct badges for success and failure', async () => {
     
    ((window as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockAuditResponse,
    });

    render(<LoginAuditSection onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows method badges correctly', async () => {
     
    ((window as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockAuditResponse,
    });

    render(<LoginAuditSection onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('Password')).toBeInTheDocument();
      expect(screen.getByText('Passkey')).toBeInTheDocument();
    });
  });

  it('can toggle suspicious flag on an entry', async () => {
     
    ((window as any).fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockAuditResponse })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, is_suspicious: true }),
      });

    render(<LoginAuditSection onError={mockOnError} />);

    await waitFor(() => screen.getByText('192.168.1.1'));

    const flagButtons = screen.getAllByTitle('Mark as suspicious');
    fireEvent.click(flagButtons[0]!);

    await waitFor(() => {
       
      expect((window as any).fetch).toHaveBeenCalledWith(
        '/api/login-audit/1/suspicious',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows pagination when multiple pages', async () => {
     
    ((window as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...mockAuditResponse,
        last_page: 3,
        total: 60,
      }),
    });

    render(<LoginAuditSection onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 3 (60 total)')).toBeInTheDocument();
    });
  });
});
