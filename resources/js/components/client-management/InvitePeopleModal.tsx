import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import type { User, ClientCompany } from '@/types/client-management/common'

interface InvitePeopleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  companies: ClientCompany[]
  onSuccess: () => void
}

const NEW_USER_VALUE = '__new_user__'

export default function InvitePeopleModal({ open, onOpenChange, companies, onSuccess }: InvitePeopleModalProps) {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isNewUser = selectedUserId === NEW_USER_VALUE

  useEffect(() => {
    if (open) {
      fetchUsers()
      setError(null)
    }
  }, [open])

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/client/mgmt/users')
      const data = await response.json()
      setUsers(data)
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCompanyId) return
    if (!isNewUser && !selectedUserId) return
    if (isNewUser && (!newUserName.trim() || !newUserEmail.trim())) return

    setLoading(true)
    setError(null)

    try {
      let response: Response

      if (isNewUser) {
        // Create new user and assign
        response = await fetch('/api/client/mgmt/create-user-and-assign', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
          },
          body: JSON.stringify({
            name: newUserName.trim(),
            email: newUserEmail.trim(),
            client_company_id: parseInt(selectedCompanyId)
          })
        })
      } else {
        // Assign existing user
        response = await fetch('/api/client/mgmt/assign-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
          },
          body: JSON.stringify({
            user_id: parseInt(selectedUserId),
            client_company_id: parseInt(selectedCompanyId)
          })
        })
      }

      if (response.ok) {
        onSuccess()
        handleClose()
      } else {
        const data = await response.json()
        if (data.errors) {
          // Validation errors
          const messages = Object.values(data.errors).flat().join(', ')
          setError(messages)
        } else if (data.error) {
          setError(data.error)
        } else if (data.message) {
          setError(data.message)
        } else {
          setError('Failed to complete operation')
        }
      }
    } catch (error) {
      console.error('Error:', error)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setSelectedUserId('')
    setSelectedCompanyId('')
    setNewUserName('')
    setNewUserEmail('')
    setError(null)
  }

  const handleUserChange = (value: string) => {
    setSelectedUserId(value)
    setError(null)
    if (value !== NEW_USER_VALUE) {
      setNewUserName('')
      setNewUserEmail('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite People to Client Company</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="user">Select User</Label>
            <select
              id="user"
              value={selectedUserId}
              onChange={(e) => handleUserChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            >
              <option value="">Choose a user...</option>
              <option value={NEW_USER_VALUE} className="font-medium">➕ Add a new user</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </div>

          {isNewUser && (
            <>
              <div className="space-y-2">
                <Label htmlFor="newUserName">New User's Name</Label>
                <Input
                  id="newUserName"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newUserEmail">New User's Email</Label>
                <Input
                  id="newUserEmail"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="john@example.com"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  A random password will be assigned. The user can use "Reset Password" to gain access.
                </p>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="company">Select Client Company</Label>
            <select
              id="company"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            >
              <option value="">Choose a company...</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>
                  {company.company_name}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !selectedCompanyId || (!isNewUser && !selectedUserId) || (isNewUser && (!newUserName.trim() || !newUserEmail.trim()))}
            >
              {loading ? 'Adding...' : (isNewUser ? 'Create & Add User' : 'Add User')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
