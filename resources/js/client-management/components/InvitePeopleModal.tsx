import { AlertCircle } from 'lucide-react'
import { useEffect,useState } from 'react'

import type { ClientCompany,User } from '@/client-management/types/common'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter,DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchWrapper } from '@/fetchWrapper'

interface InvitePeopleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  companies: ClientCompany[]
  onSuccess: () => void
  preselectedCompanyId?: number | null
}

const NEW_USER_VALUE = '__new_user__'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return 'An unexpected error occurred'
}

export default function InvitePeopleModal({ open, onOpenChange, companies, onSuccess, preselectedCompanyId }: InvitePeopleModalProps) {
  const [users, setUsers] = useState<User[]>([])
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isNewUser = selectedUserId === NEW_USER_VALUE

  const fetchUsers = async () => {
    try {
      const data = await fetchWrapper.get('/api/client/mgmt/users')

      if (!Array.isArray(data)) {
        throw new Error('Unexpected response from the user list API.')
      }

      setUsers(data as User[])
    } catch (error) {
      console.error('Error fetching users:', error)
      setUsers([])
    }
  }

  const fetchCurrentUser = async () => {
    try {
      // Get current user from app-initial-data script tag
      const script = document.getElementById('app-initial-data')
      if (script && script.textContent) {
        const data = JSON.parse(script.textContent)
        if (data.user && data.user.id) {
          setCurrentUserId(data.user.id)
          // Pre-select current user
          setSelectedUserId(data.user.id.toString())
        }
      }
    } catch (error) {
      console.error('Error fetching current user:', error)
    }
  }

  useEffect(() => {
    if (open) {
      fetchUsers()
      fetchCurrentUser()
      setError(null)
      if (preselectedCompanyId) {
        setSelectedCompanyId(preselectedCompanyId.toString())
      }
    }
  }, [open, preselectedCompanyId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCompanyId) return
    if (!isNewUser && !selectedUserId) return
    if (isNewUser && (!newUserName.trim() || !newUserEmail.trim())) return

    setLoading(true)
    setError(null)

    try {
      if (isNewUser) {
        await fetchWrapper.post('/api/client/mgmt/create-user-and-assign', {
          name: newUserName.trim(),
          email: newUserEmail.trim(),
          client_company_id: parseInt(selectedCompanyId)
        })
      } else {
        await fetchWrapper.post('/api/client/mgmt/assign-user', {
          user_id: parseInt(selectedUserId),
          client_company_id: parseInt(selectedCompanyId)
        })
      }

      onSuccess()
      handleClose()
    } catch (error) {
      console.error('Error:', error)
      setError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setSelectedUserId(currentUserId ? currentUserId.toString() : '')
    setSelectedCompanyId(preselectedCompanyId ? preselectedCompanyId.toString() : '')
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
