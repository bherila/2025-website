import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, ArrowLeft, Check, Star, EyeOff } from 'lucide-react'
import NewTaskModal from './NewTaskModal'

interface User {
  id: number
  name: string
  email: string
}

interface Task {
  id: number
  name: string
  description: string | null
  completed_at: string | null
  assignee: User | null
  creator: User | null
  is_high_priority: boolean
  is_hidden_from_clients: boolean
  created_at: string
}

interface ClientPortalProjectPageProps {
  slug: string
  companyName: string
  projectSlug: string
  projectName: string
}

export default function ClientPortalProjectPage({ slug, companyName, projectSlug, projectName }: ClientPortalProjectPageProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [newTaskModalOpen, setNewTaskModalOpen] = useState(false)
  const [companyUsers, setCompanyUsers] = useState<User[]>([])

  useEffect(() => {
    fetchTasks()
    fetchCompanyUsers()
  }, [slug, projectSlug])

  const fetchTasks = async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}/projects/${projectSlug}/tasks`)
      if (response.ok) {
        const data = await response.json()
        setTasks(data)
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCompanyUsers = async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}`)
      if (response.ok) {
        const data = await response.json()
        setCompanyUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error fetching company users:', error)
    }
  }

  const toggleTaskComplete = async (task: Task) => {
    try {
      const response = await fetch(`/api/client/portal/${slug}/projects/${projectSlug}/tasks/${task.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        },
        body: JSON.stringify({ completed: !task.completed_at })
      })

      if (response.ok) {
        fetchTasks()
      }
    } catch (error) {
      console.error('Error updating task:', error)
    }
  }

  const incompleteTasks = tasks.filter(t => !t.completed_at)
  const completedTasks = tasks.filter(t => t.completed_at)

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <div className="mb-6">
        <Button variant="ghost" className="mb-4" onClick={() => window.location.href = `/client/portal/${slug}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
        
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">{companyName}</p>
            <h1 className="text-3xl font-bold">{projectName}</h1>
          </div>
          <Button onClick={() => setNewTaskModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Task
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {incompleteTasks.length === 0 && completedTasks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Check className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No tasks yet</h3>
              <p className="text-muted-foreground mb-4">Create your first task to get started</p>
              <Button onClick={() => setNewTaskModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Task
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {incompleteTasks.map(task => (
              <Card key={task.id} className={task.is_high_priority ? 'border-l-4 border-l-orange-500' : ''}>
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => toggleTaskComplete(task)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{task.name}</span>
                        {task.is_high_priority && (
                          <Star className="h-4 w-4 text-orange-500 fill-orange-500" />
                        )}
                        {task.is_hidden_from_clients && (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                      )}
                      <div className="flex gap-2 mt-2">
                        {task.assignee && (
                          <Badge variant="secondary">{task.assignee.name}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {completedTasks.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-medium mb-4 text-muted-foreground">Completed ({completedTasks.length})</h3>
                {completedTasks.map(task => (
                  <Card key={task.id} className="opacity-60 mb-2">
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={true}
                          onCheckedChange={() => toggleTaskComplete(task)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <span className="font-medium line-through">{task.name}</span>
                          {task.assignee && (
                            <Badge variant="secondary" className="ml-2">{task.assignee.name}</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <NewTaskModal
        open={newTaskModalOpen}
        onOpenChange={setNewTaskModalOpen}
        slug={slug}
        projectSlug={projectSlug}
        users={companyUsers}
        onSuccess={fetchTasks}
      />
    </div>
  )
}
