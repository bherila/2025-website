'use client'

import { LogIn, X } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchWrapper } from '@/fetchWrapper'

import type { FeaturePermissionDefinition, User } from './UserManagementPage'

interface UserActionsModalProps {
  user: User
  availableRoles: string[]
  featurePermissions: Record<string, FeaturePermissionDefinition[]>
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
}

export default function UserActionsModal({
  user,
  availableRoles,
  featurePermissions,
  isOpen,
  onClose,
  onUpdate,
}: UserActionsModalProps) {
  const [newPassword, setNewPassword] = useState('')
  const [newEmail, setNewEmail] = useState(user.email)
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(user.direct_permissions ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Filter out roles the user already has
  const rolesNotAssigned = availableRoles.filter(
    (role) => !user.roles.includes(role)
  )
  const canPreviewClientPortal = user.can_login_as_client && user.client_companies.length > 0

  const handlePermissionToggle = (permission: string, checked: boolean): void => {
    setSelectedPermissions((current) => checked ? Array.from(new Set([...current, permission])) : current.filter((item) => item !== permission))
  }

  const handlePreset = (permissions: string[]): void => {
    setSelectedPermissions(permissions)
  }

  const handleSaveFeaturePermissions = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await fetchWrapper.put(`/api/admin/users/${user.id}/feature-permissions`, {
        permissions: selectedPermissions,
      })
      setSuccess('Feature permissions updated')
      onUpdate()
    } catch (err) {
      setError('Failed to update feature permissions')
    } finally {
      setLoading(false)
    }
  }

  const inheritedPermissions = user.effective_permissions.filter((permission) => !selectedPermissions.includes(permission))
  const fullFinancePermissions = Object.values(featurePermissions)
    .flat()
    .map((definition) => definition.permission)
    .filter((permission) => permission.startsWith('finance.'))


  const handleUpdateEmail = async () => {
    if (!newEmail || !newEmail.includes('@')) {
      setError('Please enter a valid email address')
      return
    }

    if (newEmail === user.email) {
      setError('Email is the same as current email')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await fetchWrapper.post(`/api/admin/users/${user.id}/email`, {
        email: newEmail,
      })
      setSuccess('Email updated successfully')
      onUpdate()
    } catch (err) {
      setError('Failed to update email')
    } finally {
      setLoading(false)
    }
  }

  const handleSetPassword = async () => {
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await fetchWrapper.post(`/api/admin/users/${user.id}/password`, {
        password: newPassword,
      })
      setSuccess('Password updated successfully')
      setNewPassword('')
    } catch (err) {
      setError('Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  const handleAddRole = async () => {
    if (!selectedRole) return

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await fetchWrapper.post(`/api/admin/users/${user.id}/roles`, {
        role: selectedRole,
      })
      setSuccess(`Role '${selectedRole}' added`)
      setSelectedRole('')
      onUpdate()
    } catch (err) {
      setError('Failed to add role')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveRole = async (role: string) => {
    // Prevent removing admin from user ID 1
    if (role === 'admin' && user.id === 1) {
      setError('Cannot remove admin role from the primary administrator')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await fetchWrapper.delete(`/api/admin/users/${user.id}/roles/${role}`, {})
      setSuccess(`Role '${role}' removed`)
      onUpdate()
    } catch (err) {
      setError('Failed to remove role')
    } finally {
      setLoading(false)
    }
  }

  const handleLoginAs = async (clientCompanyId: number) => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetchWrapper.post(`/api/admin/users/${user.id}/login-as`, {
        client_company_id: clientCompanyId,
      }) as { redirect_url: string }

      window.location.assign(response.redirect_url)
    } catch (err) {
      setError('Failed to start client portal preview')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Manage User: {user.name}</DialogTitle>
          <DialogDescription>
            {user.email} (ID: {user.id})
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-2 rounded">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-2 rounded">
            {success}
          </div>
        )}

        <div className="space-y-6">
          {/* Update Email Section */}
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="flex gap-2">
              <Input
                id="email"
                type="email"
                name="admin-user-email-edit"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <Button
                onClick={handleUpdateEmail}
                disabled={loading || newEmail === user.email}
              >
                Update
              </Button>
            </div>
          </div>

          {/* Add Role Section */}
          <div className="space-y-2">
            <Label>Add Role</Label>
            <div className="flex gap-2">
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select role to add" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} sideOffset={4}>
                  {rolesNotAssigned.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No roles available
                    </SelectItem>
                  ) : (
                    rolesNotAssigned.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddRole}
                disabled={loading || !selectedRole}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Current Roles Section */}
          <div className="space-y-2">
            <Label>Current Roles</Label>
            <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[48px]">
              {user.roles.length === 0 ? (
                <span className="text-muted-foreground text-sm">
                  No roles assigned (user is disabled)
                </span>
              ) : (
                user.roles.map((role) => (
                  <Badge
                    key={role}
                    variant={role === 'admin' ? 'destructive' : 'secondary'}
                    className="flex items-center gap-1 pr-1"
                  >
                    {role}
                    <button
                      type="button"
                      onClick={() => handleRemoveRole(role)}
                      disabled={loading || (role === 'admin' && user.id === 1)}
                      className="ml-1 hover:bg-white/20 rounded-full p-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={
                        role === 'admin' && user.id === 1
                          ? 'Cannot remove admin from primary admin'
                          : `Remove ${role} role`
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Users without &apos;user&apos; or &apos;admin&apos; role cannot log in.
            </p>
          </div>


          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Feature Access</Label>
              <Button type="button" size="sm" variant="outline" onClick={handleSaveFeaturePermissions} disabled={loading}>
                Save features
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => handlePreset(['finance.tax-preview.view'])}>Tax Preview only</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => handlePreset(['finance.rsu.view'])}>RSU only</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => handlePreset(['finance.transactions.view'])}>Transactions read-only</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => handlePreset(fullFinancePermissions)}>Full Finance</Button>
            </div>
            <div className="max-h-80 space-y-4 overflow-y-auto rounded-md border p-3">
              {Object.entries(featurePermissions).map(([category, definitions]) => (
                <div key={category} className="space-y-2">
                  <p className="text-sm font-medium">{category}</p>
                  <div className="space-y-2">
                    {definitions.map((definition) => (
                      <label key={definition.permission} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedPermissions.includes(definition.permission)}
                          onChange={(event) => handlePermissionToggle(definition.permission, event.target.checked)}
                        />
                        <span className="space-y-1">
                          <span className="block font-medium">{definition.label}</span>
                          <span className="block text-xs text-muted-foreground">{definition.permission}</span>
                          <span className="block text-xs text-muted-foreground">{definition.description}</span>
                          {definition.permission === 'finance.accounts.basic' && (
                            <span className="block text-xs text-amber-600 dark:text-amber-400">Dependency only: does not grant full Accounts pages.</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {inheritedPermissions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Included dependencies</p>
                <div className="flex flex-wrap gap-1">
                  {inheritedPermissions.map((permission) => (
                    <Badge key={permission} variant="outline">{permission}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Set Password Section */}
          <div className="space-y-2">
            <Label htmlFor="password">Set New Password</Label>
            <div className="flex gap-2">
              <Input
                id="password"
                type="password"
                placeholder="New password (min 8 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Button onClick={handleSetPassword} disabled={loading}>
                Set
              </Button>
            </div>
          </div>

          {canPreviewClientPortal && (
            <div className="space-y-2">
              <Label>Client Portal Preview</Label>
              <div className="flex flex-wrap gap-2">
                {user.client_companies.map((company) => (
                  <Button
                    key={company.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleLoginAs(company.id)}
                    disabled={loading}
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    Login as {company.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
