import { KeyRound } from 'lucide-react';
import React, { useState } from 'react';

import { arrayBufferToBase64url, base64urlToArrayBuffer, getCsrfToken } from './user/webauthn-utils';

interface PasskeyLoginButtonProps {
  onSuccess?: (redirectUrl: string) => void;
  onError?: (message: string) => void;
}

export const PasskeyLoginButton: React.FC<PasskeyLoginButtonProps> = ({ onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePasskeyLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      // Step 1: Get authentication options
      const optRes = await fetch('/api/passkeys/auth/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': getCsrfToken(),
        },
      });
      if (!optRes.ok) throw new Error('Failed to get authentication options');
      const options = await optRes.json();

      const publicKey: PublicKeyCredentialRequestOptions = {
        ...options,
        challenge: base64urlToArrayBuffer(options.challenge),
        allowCredentials: (options.allowCredentials || []).map((c: { type: string; id: string }) => ({
          ...c,
          id: base64urlToArrayBuffer(c.id),
        })),
      };

      // Step 2: Get assertion from browser
      const credential = await navigator.credentials.get({ publicKey });
      if (!credential || credential.type !== 'public-key') {
        throw new Error('No passkey selected');
      }

      const pkCredential = credential as PublicKeyCredential;
      const response = pkCredential.response as AuthenticatorAssertionResponse;

      const credentialData = {
        id: pkCredential.id,
        rawId: arrayBufferToBase64url(pkCredential.rawId),
        type: pkCredential.type,
        response: {
          clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
          authenticatorData: arrayBufferToBase64url(response.authenticatorData),
          signature: arrayBufferToBase64url(response.signature),
          userHandle: response.userHandle ? arrayBufferToBase64url(response.userHandle) : null,
        },
      };

      // Step 3: Verify
      const authRes = await fetch('/api/passkeys/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': getCsrfToken(),
        },
        body: JSON.stringify({ credential: credentialData }),
      });

      if (!authRes.ok) {
        const err = await authRes.json();
        throw new Error(err.error || 'Authentication failed');
      }

      const result = await authRes.json();
      if (onSuccess) {
        onSuccess(result.redirect || '/');
      } else {
        window.location.href = result.redirect || '/';
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Passkey login failed';
      // Ignore user-cancelled errors
      if (message.includes('timed out') || message.includes('not allowed') || message.includes('cancelled')) {
        setLoading(false);
        return;
      }
      setError(message);
      if (onError) onError(message);
    } finally {
      setLoading(false);
    }
  };

  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return null;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
      <button
        type="button"
        onClick={handlePasskeyLogin}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-2 px-4 rounded-md font-medium hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors cursor-pointer disabled:opacity-60"
      >
        <KeyRound className="h-5 w-5" aria-hidden="true" />
        {loading ? 'Verifying…' : 'Sign in with Passkey'}
      </button>
    </div>
  );
};
