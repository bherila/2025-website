/**
 * Tests for PasskeySection component — key regressions.
 *
 *  1. The React dialog must be closed BEFORE navigator.credentials.create() is
 *     called, otherwise a Radix UI focus-trap blocks the browser's native
 *     passkey prompt.
 *  2. SecurityError / NotAllowedError (e.g. from an RP-ID mismatch) must NOT
 *     be silently swallowed — they must be surfaced via onError().
 *  3. True user-cancellation (AbortError) is silently ignored (no onError call).
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { PasskeySection } from '../passkey-section';

// ---------------------------------------------------------------------------
// Helpers / mocks
// ---------------------------------------------------------------------------

const mockRegistrationOptions = {
  challenge: 'dGVzdC1jaGFsbGVuZ2U', // base64url "test-challenge"
  rp: { name: 'Test App', id: 'localhost' },
  user: {
    id: 'MQ', // base64url "1"
    name: 'Test User',
    displayName: 'test@example.com',
  },
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  timeout: 60000,
  excludeCredentials: [],
  authenticatorSelection: {
    residentKey: 'preferred',
    requireResidentKey: false,
    userVerification: 'preferred',
  },
  attestation: 'none',
};

/** Build a fake PublicKeyCredential returned by navigator.credentials.create(). */
function makeFakeCredential() {
  // Use a simple Uint8Array to avoid TextEncoder which isn't in JSDOM
  const buf = (s: string) => new Uint8Array(Array.from(s).map((c) => c.charCodeAt(0))).buffer;
  return {
    type: 'public-key',
    id: 'fake-cred-id',
    rawId: buf('fake-raw-id'),
    response: {
      clientDataJSON: buf('{}'),
      attestationObject: buf('attest'),
      getTransports: () => ['internal'],
    },
  };
}

// Stub window.PublicKeyCredential so isWebAuthnSupported is true
Object.defineProperty(window, 'PublicKeyCredential', {
  writable: true,
  value: class MockPublicKeyCredential {},
});

// Stub navigator.credentials
Object.defineProperty(window.navigator, 'credentials', {
  writable: true,
  value: {
    create: jest.fn(),
    get: jest.fn(),
  },
});

// ---------------------------------------------------------------------------

describe('PasskeySection — registration regressions', () => {
  const mockOnSuccess = jest.fn();
  const mockOnError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '<meta name="csrf-token" content="test-csrf">';
    (window as unknown as Record<string, unknown>).fetch = jest.fn();
  });

  function mockFetch(credentialsImpl: () => Promise<unknown>) {
    ((window as unknown as Record<string, unknown>).fetch as jest.Mock).mockImplementation(
      (url: string) => {
        if (url === '/api/passkeys') {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (url === '/api/passkeys/register/options') {
          return Promise.resolve({
            ok: true,
            json: async () => mockRegistrationOptions,
          });
        }
        if (url === '/api/passkeys/register') {
          return Promise.resolve({ ok: true, json: async () => ({ id: 2 }) });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      },
    );
    (navigator.credentials.create as jest.Mock).mockImplementation(credentialsImpl);
  }

  async function clickAddPasskey() {
    await waitFor(() => screen.getByRole('button', { name: /add passkey/i }));
    fireEvent.click(screen.getByRole('button', { name: /add passkey/i }));
    await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    });
  }

  it('closes dialog before calling navigator.credentials.create (regression: focus-trap bug)', async () => {
    let dialogOpenDuringCredCreate: boolean | null = null;

    ((window as unknown as Record<string, unknown>).fetch as jest.Mock).mockImplementation(
      (url: string) => {
        if (url === '/api/passkeys') {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (url === '/api/passkeys/register/options') {
          return Promise.resolve({ ok: true, json: async () => mockRegistrationOptions });
        }
        if (url === '/api/passkeys/register') {
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      },
    );

    (navigator.credentials.create as jest.Mock).mockImplementation(() => {
      // At the moment credentials.create() is called, the dialog must already be
      // closed. A Radix UI focus-trap will block the browser's native passkey UI
      // if the dialog is still open at this point.
      dialogOpenDuringCredCreate = !!document.querySelector('[role="dialog"]');
      return Promise.resolve(makeFakeCredential());
    });

    render(<PasskeySection onSuccess={mockOnSuccess} onError={mockOnError} />);
    await clickAddPasskey();

    await waitFor(() => {
      expect(navigator.credentials.create).toHaveBeenCalledTimes(1);
    });

    // The dialog must have been CLOSED before credentials.create was called.
    expect(dialogOpenDuringCredCreate).toBe(false);
    expect(mockOnError).not.toHaveBeenCalled();
  });

  it('surfaces SecurityError / NotAllowedError instead of silently swallowing it (regression)', async () => {
    mockFetch(() => {
      // Simulate what browsers throw when the RP ID doesn't match the origin.
      // Previously this error was silently swallowed because its message matched
      // the "user cancelled" filter, leaving users with no feedback.
      const err = new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError');
      return Promise.reject(err);
    });

    render(<PasskeySection onSuccess={mockOnSuccess} onError={mockOnError} />);
    await clickAddPasskey();

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        'passkeys',
        expect.stringContaining('not allowed'),
      );
    });
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('silently ignores AbortError (user pressed Cancel in browser UI)', async () => {
    mockFetch(() => {
      const err = new DOMException('User cancelled', 'AbortError');
      return Promise.reject(err);
    });

    render(<PasskeySection onSuccess={mockOnSuccess} onError={mockOnError} />);
    await clickAddPasskey();

    await waitFor(() => {
      expect(navigator.credentials.create).toHaveBeenCalledTimes(1);
    });

    // True user cancellation must not surface an error.
    expect(mockOnError).not.toHaveBeenCalled();
  });

  it('calls onSuccess after a successful registration', async () => {
    mockFetch(() => Promise.resolve(makeFakeCredential()));

    render(<PasskeySection onSuccess={mockOnSuccess} onError={mockOnError} />);
    await clickAddPasskey();

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith(expect.stringContaining('registered'));
    });
    expect(mockOnError).not.toHaveBeenCalled();
  });
});

