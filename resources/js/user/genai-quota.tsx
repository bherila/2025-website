import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface GenAiQuotaSectionProps {
  currentLimit: number | null;
  onSuccess: (message: string) => void;
  onError: (field: string, message: string) => void;
  onUserUpdate: () => void;
}

export const GenAiQuotaSection: React.FC<GenAiQuotaSectionProps> = ({
  currentLimit,
  onSuccess,
  onError,
  onUserUpdate,
}) => {
  const [limitValue, setLimitValue] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = limitValue.trim() === '' ? null : parseInt(limitValue.trim(), 10);

    if (parsed !== null && (isNaN(parsed) || parsed < 1 || parsed > 10000)) {
      onError('genaiQuota', 'Limit must be a number between 1 and 10,000');
      return;
    }

    try {
      const response = await fetch('/api/user/update-genai-quota', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
        body: JSON.stringify({ genai_daily_quota_limit: parsed }),
      });

      if (response.ok) {
        const data = await response.json();
        onSuccess(data.message || 'GenAI quota updated successfully');
        setLimitValue('');
        onUserUpdate();
      } else {
        const errorData = await response.json();
        onError('genaiQuota', errorData.message || 'Failed to update GenAI quota');
      }
    } catch {
      onError('genaiQuota', 'Network error');
    }
  };

  const statusText =
    currentLimit != null ? `${currentLimit} requests/day` : 'Using system default';

  return (
    <Card>
      <CardHeader>
        <CardTitle>GenAI Daily Quota</CardTitle>
        <CardDescription>
          Current limit: {statusText}. Leave blank to use the system default. This limits how many
          AI document imports you can run per day.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="genaiQuotaLimit">Daily Request Limit</Label>
            <Input
              id="genaiQuotaLimit"
              type="number"
              min={1}
              max={10000}
              value={limitValue}
              onChange={(e) => setLimitValue(e.target.value)}
              placeholder={`Leave blank to use system default${currentLimit != null ? ` (currently ${currentLimit})` : ''}`}
            />
          </div>
          <Button type="submit">{limitValue.trim() ? 'Update Limit' : 'Reset to Default'}</Button>
        </form>
      </CardContent>
    </Card>
  );
};
