import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface User {
  id: number;
  name: string;
  email: string;
  gemini_api_key: string | null;
}

interface ApiKeySectionProps {
  user: User | null;
  onSuccess: (message: string) => void;
  onError: (field: string, message: string) => void;
  onUserUpdate: () => void;
}

export const ApiKeySection: React.FC<ApiKeySectionProps> = ({
  user,
  onSuccess,
  onError,
  onUserUpdate,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const updateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const isClearing = !apiKey.trim();

    // If clearing, show confirmation dialog
    if (isClearing && user?.gemini_api_key) {
      setIsDialogOpen(true);
      return;
    }

    await performApiKeyUpdate(isClearing);
  };

  const performApiKeyUpdate = async (isClearing: boolean) => {
    try {
      const response = await fetch('/api/user/update-api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
        body: JSON.stringify({ gemini_api_key: isClearing ? null : apiKey }),
      });
      if (response.ok) {
        onSuccess(isClearing ? 'API key cleared successfully' : 'API Key updated successfully');
        setApiKey('');
        onUserUpdate();
        setIsDialogOpen(false);
      } else {
        const errorData = await response.json();
        onError('apiKey', errorData.message || `Failed to ${isClearing ? 'clear' : 'update'} API key`);
        setIsDialogOpen(false);
      }
    } catch (error) {
      onError('apiKey', 'Network error');
      setIsDialogOpen(false);
    }
  };

  const handleConfirmClear = () => {
    performApiKeyUpdate(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Gemini API Key</CardTitle>
          <CardDescription>
            Status: {user?.gemini_api_key ? `Set to key ending in ${user.gemini_api_key}` : 'Not Set'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={updateApiKey} className="space-y-4">
            <div>
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="text"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Gemini API key (leave empty to clear)"
              />
            </div>
            <Button type="submit">
              {apiKey.trim() ? 'Update API Key' : 'Clear API Key'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm API Key Removal</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear your Gemini API key? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmClear}>
              Clear API Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};