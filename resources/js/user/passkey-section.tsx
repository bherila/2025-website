import { Key, Plus, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import {
  arrayBufferToBase64url,
  base64urlToArrayBuffer,
  getCsrfToken,
} from './webauthn-utils';

interface Passkey {
  id: number;
  name: string;
  aaguid: string | null;
  created_at: string;
  updated_at: string;
}

interface PasskeySectionProps {
  onSuccess: (message: string) => void;
  onError: (field: string, message: string) => void;
}

function getDeviceName(): string {
  const ua = window.navigator.userAgent;
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';

  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';

  if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return `Passkey (${browser} on ${os})`;
}

export const PasskeySection: React.FC<PasskeySectionProps> = ({ onSuccess, onError }) => {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [showNameDialog, setShowNameDialog] = useState(false);

  const fetchPasskeys = useCallback(async () => {
    try {
      const res = await fetch('/api/passkeys');
      if (res.ok) {
        const data = await res.json();
        setPasskeys(data);
      }
    } catch {
      onError('passkeys', 'Failed to load passkeys');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    fetchPasskeys();
  }, [fetchPasskeys]);

  const startRegistration = () => {
    setNewPasskeyName(getDeviceName());
    setShowNameDialog(true);
  };

  const registerPasskey = async () => {
    // Close the name dialog immediately so the browser's native passkey UI is
    // not blocked by a React focus-trap (Radix Dialog traps focus while open).
    setShowNameDialog(false);
    setRegistering(true);
    try {
      // Step 1: Get registration options
      const optRes = await fetch('/api/passkeys/register/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': getCsrfToken(),
        },
      });
      if (!optRes.ok) throw new Error('Failed to get registration options');
      const options = await optRes.json();

      // Convert base64 challenge and user.id to ArrayBuffer
      const publicKey: PublicKeyCredentialCreationOptions = {
        ...options,
        challenge: base64urlToArrayBuffer(options.challenge),
        user: {
          ...options.user,
          id: base64urlToArrayBuffer(options.user.id),
        },
        excludeCredentials: (options.excludeCredentials || []).map((c: { type: string; id: string }) => ({
          ...c,
          id: base64urlToArrayBuffer(c.id),
        })),
      };

      // Step 2: Create credential via browser WebAuthn API
      const credential = await navigator.credentials.create({ publicKey });
      if (!credential || credential.type !== 'public-key') {
        throw new Error('Failed to create credential');
      }

      const pkCredential = credential as PublicKeyCredential;
      const response = pkCredential.response as AuthenticatorAttestationResponse;

      const credentialData = {
        id: pkCredential.id,
        rawId: arrayBufferToBase64url(pkCredential.rawId),
        type: pkCredential.type,
        response: {
          clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
          attestationObject: arrayBufferToBase64url(response.attestationObject),
          transports: response.getTransports ? response.getTransports() : [],
        },
      };

      // Step 3: Verify and store
      const verifyRes = await fetch('/api/passkeys/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': getCsrfToken(),
        },
        body: JSON.stringify({
          credential: credentialData,
          name: newPasskeyName || 'Passkey',
        }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Registration failed');
      }

      onSuccess('Passkey registered successfully!');
      fetchPasskeys();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Passkey registration failed';
      const name = err instanceof Error ? (err as DOMException).name : '';
      // Only suppress true user-initiated cancellations (AbortError); all other
      // failures (including SecurityError / NotAllowedError from RP-ID mismatches)
      // must be surfaced so the user knows something went wrong.
      if (name === 'AbortError') {
        console.debug('[PasskeySection] Registration cancelled by user:', message);
      } else {
        onError('passkeys', message);
      }
    } finally {
      setRegistering(false);
    }
  };

  const deletePasskey = async (id: number) => {
    try {
      const res = await fetch(`/api/passkeys/${id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-TOKEN': getCsrfToken() },
      });
      if (!res.ok) throw new Error('Delete failed');
      onSuccess('Passkey removed');
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
    } catch {
      onError('passkeys', 'Failed to delete passkey');
    } finally {
      setDeleteId(null);
    }
  };

  const isWebAuthnSupported = typeof window !== 'undefined' && !!window.PublicKeyCredential;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Passkeys
          </CardTitle>
          <CardDescription>
            Manage your passkeys for passwordless login using fingerprint, face, or device PIN.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isWebAuthnSupported && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Your browser does not support passkeys.
            </p>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading passkeys…</p>
          ) : passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No passkeys registered yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {passkeys.map((pk) => (
                  <TableRow key={pk.id}>
                    <TableCell className="font-medium">{pk.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(pk.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(pk.id)}
                        className="text-red-500 hover:text-red-700"
                        aria-label="Delete passkey"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {isWebAuthnSupported && (
            <Button
              onClick={startRegistration}
              disabled={registering}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              {registering ? 'Registering…' : 'Add Passkey'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Name dialog */}
      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name Your Passkey</DialogTitle>
            <DialogDescription>
              Give this passkey a memorable name (e.g. "MacBook Touch ID").
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="passkey-name">Name</Label>
            <Input
              id="passkey-name"
              value={newPasskeyName}
              onChange={(e) => setNewPasskeyName(e.target.value)}
              placeholder="My Passkey"
              onKeyDown={(e) => e.key === 'Enter' && registerPasskey()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNameDialog(false)}>
              Cancel
            </Button>
            <Button onClick={registerPasskey}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Passkey</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this passkey? You will no longer be able to use it to
              sign in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteId !== null && deletePasskey(deleteId)}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
