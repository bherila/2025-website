import { Plus, X } from 'lucide-react'
import { useState } from 'react'

import InvitePeopleModal from '@/client-management/components/InvitePeopleModal'
import { getErrorMessage } from '@/client-management/hooks/useClientCompanyDetail'
import type { ClientCompany } from '@/client-management/types/common'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchWrapper } from '@/fetchWrapper'

interface AssociatedUsersCardProps {
  company: ClientCompany
  companyId: number
  onChanged: () => Promise<void> | void
  onError: (message: string) => void
}

/** Lists associated users and owns the invite modal and remove-user confirmation. */
export default function AssociatedUsersCard({ company, companyId, onChanged, onError }: AssociatedUsersCardProps) {
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [userToRemove, setUserToRemove] = useState<number | null>(null)

  const handleRemoveUser = async (userId: number) => {
    try {
      await fetchWrapper.delete(`/api/client/mgmt/${companyId}/users/${userId}`, {})
      setUserToRemove(null)
      await onChanged()
    } catch (error) {
      console.error('Error removing user:', error)
      onError(getErrorMessage(error, 'Failed to remove user'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Associated Users</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setInviteModalOpen(true)}>
            <Plus className="h-3 w-3 mr-1" />
            Add User
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {company.users.length === 0 ? (
          <p className="text-muted-foreground">No users assigned to this company yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {company.users.map((user) => (
              <Badge key={user.id} variant="secondary" className="flex items-center gap-1 pr-1">
                <span>{user.name}</span>
                <button
                  onClick={() => setUserToRemove(user.id)}
                  className="ml-1 hover:bg-destructive/20 rounded-sm p-0.5"
                  title="Remove user"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={userToRemove !== null} onOpenChange={(open) => !open && setUserToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove user</AlertDialogTitle>
            <AlertDialogDescription>This removes the selected user from this company.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => userToRemove !== null && void handleRemoveUser(userToRemove)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InvitePeopleModal
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        companies={[company]}
        onSuccess={onChanged}
        preselectedCompanyId={companyId}
      />
    </Card>
  )
}
