import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface UpdateEmailSectionProps {
  currentEmail: string;
  onSuccess: (message: string) => void;
  onError: (field: string, message: string) => void;
}

export const UpdateEmailSection: React.FC<UpdateEmailSectionProps> = ({
  currentEmail,
  onSuccess,
  onError,
}) => {
  const [email, setEmail] = useState(currentEmail);

  const updateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/user/update-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        onSuccess('Email updated successfully');
      } else {
        const errorData = await response.json();
        onError('email', errorData.message || 'Failed to update email');
      }
    } catch (error) {
      onError('email', 'Network error');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Update Email</CardTitle>
        <CardDescription>Change your email address</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={updateEmail} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit">Update Email</Button>
        </form>
      </CardContent>
    </Card>
  );
};