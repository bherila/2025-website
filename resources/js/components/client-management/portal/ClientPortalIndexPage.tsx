import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Clock, FolderOpen } from 'lucide-react'
import NewProjectModal from './NewProjectModal'

interface Project {
  id: number
  name: string
  slug: string
  description: string | null
  tasks_count: number
  time_entries_count: number
  created_at: string
}

interface ClientPortalIndexPageProps {
  slug: string
  companyName: string
}

export default function ClientPortalIndexPage({ slug, companyName }: ClientPortalIndexPageProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: number, user_role: string | null } | null>(null)
  const [companyId, setCompanyId] = useState<number | null>(null)

  const isAdmin = currentUser?.id === 1 || currentUser?.user_role === 'Admin'

  useEffect(() => {
    document.title = `Client Home: ${companyName}`
  }, [companyName])

  useEffect(() => {
    fetchProjects()
    fetchCurrentUser()
    fetchCompanyData()
  }, [slug])

  const fetchCurrentUser = async () => {
    try {
      const response = await fetch('/api/user')
      if (response.ok) {
        const data = await response.json()
        setCurrentUser(data)
      }
    } catch (error) {
      console.error('Error fetching current user:', error)
    }
  }

  const fetchCompanyData = async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}`)
      if (response.ok) {
        const data = await response.json()
        setCompanyId(data.id)
      }
    } catch (error) {
      console.error('Error fetching company data:', error)
    }
  }

  const fetchProjects = async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}/projects`)
      if (response.ok) {
        const data = await response.json()
        setProjects(data)
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-8 max-w-6xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Skeleton className="h-10 w-48 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      {isAdmin && (
        <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <Plus className="h-5 w-5" /> Admin: Manage clients
            </h2>
          </div>
          <Button 
            variant="secondary" 
            onClick={() => window.location.href = `/client/mgmt/${companyId}`}
            disabled={!companyId}
          >
            Manage project
          </Button>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">{companyName}</h1>
          <p className="text-muted-foreground">Client Portal</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.href = `/client/portal/${slug}/time`}>
            <Clock className="mr-2 h-4 w-4" />
            Time Tracking
          </Button>
          <Button onClick={() => setNewProjectModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No projects yet</h3>
            <p className="text-muted-foreground mb-4">Create your first project to get started</p>
            <Button onClick={() => setNewProjectModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map(project => (
            <Card key={project.id} className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => window.location.href = `/client/portal/${slug}/project/${project.slug}`}>
              <CardHeader>
                <CardTitle className="text-lg">{project.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {project.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{project.description}</p>
                )}
                <div className="flex gap-2">
                  <Badge variant="secondary">{project.tasks_count} tasks</Badge>
                  <Badge variant="outline">{project.time_entries_count} time entries</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewProjectModal
        open={newProjectModalOpen}
        onOpenChange={setNewProjectModalOpen}
        slug={slug}
        onSuccess={fetchProjects}
      />
    </div>
  )
}
