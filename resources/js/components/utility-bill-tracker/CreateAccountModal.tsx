import * as React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CreateAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccountCreated: () => void;
}

export function CreateAccountModal({ open, onOpenChange, onAccountCreated }: CreateAccountModalProps) {
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<'Electricity' | 'General'>('General');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/utility-bill-tracker/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
        body: JSON.stringify({
          account_name: accountName,
          account_type: accountType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || data.errors?.account_name?.[0] || 'Failed to create account');
      }

      setAccountName('');
      setAccountType('General');
      onAccountCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setAccountName('');
      setAccountType('General');
      setError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Utility Account</DialogTitle>
            <DialogDescription>
              Add a new utility account to track your bills. The account type cannot be changed later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="account_name">Account Name</Label>
              <Input
                id="account_name"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g., PECO Electric"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account_type">Account Type</Label>
              <Select value={accountType} onValueChange={(value) => setAccountType(value as 'Electricity' | 'General')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Electricity">Electricity</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Electricity accounts can track power consumption and fee breakdowns.
              </p>
            </div>

            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !accountName.trim()}>
              {submitting ? 'Creating...' : 'Create Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
