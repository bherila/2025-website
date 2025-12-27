'use client'

import { useEffect, useState } from 'react'

import { Plus } from 'lucide-react'

import Container from '@/components/container'
import MainTitle from '@/components/MainTitle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'

import CreateUserModal from './CreateUserModal'
import UserActionsModal from './UserActionsModal'

export interface User {
  id: number
  name: string
  email: string
  roles: string[]
  client_companies: { id: number; name: string; slug: string }[]
  last_login_date: string | null
  created_at: string
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([])
  const [availableRoles, setAvailableRoles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  const fetchUsers = async () => {
    try {
      const response = await fetchWrapper.get('/api/admin/users')
      setUsers(response.users)
      setAvailableRoles(response.available_roles)
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleUserAction = (user: User) => {
    setSelectedUser(user)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedUser(null)
  }

  const handleUserUpdate = () => {
    fetchUsers()
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleString()
  }

  if (loading) {
    return (
      <Container>
        <MainTitle>User Management</MainTitle>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-8 w-full mb-4" />
            <Skeleton className="h-8 w-full mb-4" />
            <Skeleton className="h-8 w-full mb-4" />
          </CardContent>
        </Card>
      </Container>
    )
  }

  return (
    <Container>
      <div className="flex justify-between items-center">
        <MainTitle>User Management</MainTitle>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Client Companies</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-mono">{user.id}</TableCell>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.client_companies.map((company) => (
                        <a key={company.id} href={`/client/portal/${company.slug}`}>
                          <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                            {company.name}
                          </Badge>
                        </a>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge
                          key={role}
                          variant={role === 'admin' ? 'destructive' : 'secondary'}
                        >
                          {role}
                        </Badge>
                      ))}
                      {user.roles.length === 0 && (
                        <span className="text-muted-foreground text-sm">No roles (disabled)</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(user.last_login_date)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUserAction(user)}
                    >
                      …
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedUser && (
        <UserActionsModal
          user={selectedUser}
          availableRoles={availableRoles}
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onUpdate={handleUserUpdate}
        />
      )}

      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleUserUpdate}
      />
    </Container>
  )
}
