'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Trash2 as Delete } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { fetchWrapper } from '@/fetchWrapper'

export const DeleteAccountSection = ({ accountId }: { accountId: number | string }) => {
  const [error, setError] = useState<string>('')

  const handleDeleteAccount = async () => {
    try {
      await fetchWrapper.delete(`/api/finance/${accountId}`, {});
      window.location.href = '/finance';
    } catch (err) {
      setError('Failed to delete account');
    }
  };

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">Delete Account</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive" className="mb-4">
              {error}
            </Alert>
          )}

          <p className="text-destructive">
            Warning: This will permanently delete all transactions associated with this account. This action cannot be
            undone.
          </p>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Delete className="me-2" />
                Delete Account Permanently
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>Confirm Account Deletion</AlertDialogTitle>
              <AlertDialogDescription>
                Are you absolutely sure you want to delete this account and all its transactions? This action cannot be
                undone.
              </AlertDialogDescription>
              <div className="flex justify-end gap-4 mt-6">
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAccount}
                  >
                    Delete Account
                  </Button>
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}
