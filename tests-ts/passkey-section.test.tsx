import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { PasskeySection } from '@/user/passkey-section';

// Mock window.PublicKeyCredential to simulate WebAuthn support
Object.defineProperty(window, 'PublicKeyCredential', {
  writable: true,
  value: class MockPublicKeyCredential {},
});

// Mock navigator.credentials
Object.defineProperty(window.navigator, 'credentials', {
  writable: true,
  value: {
    create: jest.fn(),
    get: jest.fn(),
  },
});

const mockOnSuccess = jest.fn();
const mockOnError = jest.fn();

describe('PasskeySection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '<meta name="csrf-token" content="test-csrf">';
     
    (window as any).fetch = jest.fn();
  });

  it('shows loading state initially', () => {
     
    ((window as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    render(<PasskeySection onSuccess={mockOnSuccess} onError={mockOnError} />);
    expect(screen.getByText('Loading passkeys…')).toBeInTheDocument();
  });

  it('shows empty state when no passkeys', async () => {
     
    ((window as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    render(<PasskeySection onSuccess={mockOnSuccess} onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('No passkeys registered yet.')).toBeInTheDocument();
    });
  });

  it('displays passkeys in a table', async () => {
    const mockPasskeys = [
      {
        id: 1,
        name: 'MacBook Touch ID',
        aaguid: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ];

     
    ((window as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPasskeys,
    });

    render(<PasskeySection onSuccess={mockOnSuccess} onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('MacBook Touch ID')).toBeInTheDocument();
    });
  });

  it('shows delete confirmation dialog when delete button clicked', async () => {
    const mockPasskeys = [
      {
        id: 1,
        name: 'Test Passkey',
        aaguid: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ];

     
    ((window as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPasskeys,
    });

    render(<PasskeySection onSuccess={mockOnSuccess} onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('Test Passkey')).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole('button', { name: /delete passkey/i });
    fireEvent.click(deleteButton);

    expect(screen.getByText('Remove Passkey')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to remove/)).toBeInTheDocument();
  });

  it('deletes passkey when confirmed', async () => {
    const mockPasskeys = [
      {
        id: 1,
        name: 'Test Passkey',
        aaguid: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ];

     
    ((window as any).fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockPasskeys })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    render(<PasskeySection onSuccess={mockOnSuccess} onError={mockOnError} />);

    await waitFor(() => screen.getByText('Test Passkey'));

    const deleteButton = screen.getByRole('button', { name: /delete passkey/i });
    fireEvent.click(deleteButton);

    const confirmButton = screen.getByRole('button', { name: /^remove$/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith('Passkey removed');
    });
  });

  it('shows name dialog when Add Passkey button clicked', async () => {
     
    ((window as any).fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    render(<PasskeySection onSuccess={mockOnSuccess} onError={mockOnError} />);

    await waitFor(() => screen.getByText('Add Passkey'));

    const addButton = screen.getByRole('button', { name: /add passkey/i });
    fireEvent.click(addButton);

    expect(screen.getByText('Name Your Passkey')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('My Passkey')).toBeInTheDocument();
  });
});
