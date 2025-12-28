import { useEffect, useState } from 'react'

import { format } from 'date-fns'
import { Calendar, Check, EyeOff, Plus, Star } from 'lucide-react'

import {
  DeleteFileModal,
  FileHistoryModal,
  FileList,
  FileUploadButton,
  useFileManagement,
} from '@/components/shared/FileManager'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'

import ClientPortalNav from './ClientPortalNav'
import EditTaskModal from './EditTaskModal'
import NewTaskModal from './NewTaskModal'

interface User {
  id: number
  name: string
  email: string
}

interface Task {
  id: number
  project_id: number
  name: string
  description: string | null
  completed_at: string | null
  due_date: string | null
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
  isAdmin?: boolean
}

export default function ClientPortalProjectPage({ slug, companyName, projectSlug, projectName, isAdmin = false }: ClientPortalProjectPageProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [newTaskModalOpen, setNewTaskModalOpen] = useState(false)
  const [editTaskModalOpen, setEditTaskModalOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [companyUsers, setCompanyUsers] = useState<User[]>([])
  const [togglingTasks, setTogglingTasks] = useState<Set<number>>(new Set())

  const fileManager = useFileManagement({
    listUrl: `/api/client/portal/${slug}/projects/${projectSlug}/files`,
    uploadUrl: `/api/client/portal/${slug}/projects/${projectSlug}/files`,
    uploadUrlEndpoint: `/api/client/portal/${slug}/projects/${projectSlug}/files/upload-url`,
    downloadUrlPattern: (fileId) => `/api/client/portal/${slug}/projects/${projectSlug}/files/${fileId}/download`,
    deleteUrlPattern: (fileId) => `/api/client/portal/${slug}/projects/${projectSlug}/files/${fileId}`,
    historyUrlPattern: (fileId) => `/api/client/portal/${slug}/projects/${projectSlug}/files/${fileId}/history`,
  })

  useEffect(() => {
    document.title = `Project: ${projectName} | ${companyName}`
  }, [projectName, companyName])

  useEffect(() => {
    fetchTasks()
    fetchCompanyUsers()
    fileManager.fetchFiles()
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
    setTogglingTasks(prev => new Set(prev).add(task.id))
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
    } finally {
      setTogglingTasks(prev => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setEditTaskModalOpen(true)
  }

  const incompleteTasks = tasks.filter(t => !t.completed_at)
  const completedTasks = tasks.filter(t => t.completed_at)

  if (loading) {
    return (
      <>
        <ClientPortalNav slug={slug} companyName={companyName} currentPage="project" currentProjectSlug={projectSlug} />
        <div className="container mx-auto px-8 max-w-7xl">
          <div className="mb-6">
            <Skeleton className="h-10 w-64" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
            <div>
              <Skeleton className="h-48 w-full" />
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <ClientPortalNav slug={slug} companyName={companyName} currentPage="project" currentProjectSlug={projectSlug} />
      <div className="container mx-auto px-8 max-w-7xl">
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">{projectName}</h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setNewTaskModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Task
              </Button>
              {isAdmin && (
                <FileUploadButton onUpload={fileManager.uploadFile} />
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tasks Column - 2/3 width */}
          <div className="lg:col-span-2 space-y-4">
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
                  <Card key={task.id} className={`transition-all hover:shadow-md ${task.is_high_priority ? 'border-l-4 border-l-orange-500' : ''}`}>
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {togglingTasks.has(task.id) ? (
                            <div className="h-4 w-4 rounded-sm border border-primary animate-pulse bg-primary/20" />
                          ) : (
                            <Checkbox
                              checked={false}
                              onCheckedChange={() => toggleTaskComplete(task)}
                            />
                          )}
                        </div>
                        <div className="flex-1 cursor-pointer" onClick={() => handleTaskClick(task)}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium hover:text-primary hover:underline decoration-dashed underline-offset-4">{task.name}</span>
                            {task.is_high_priority && (
                              <Star className="h-4 w-4 text-orange-500 fill-orange-500" />
                            )}
                            {task.is_hidden_from_clients && (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                          )}
                          <div className="flex gap-3 mt-2 items-center text-xs text-muted-foreground">
                            {task.assignee && (
                              <Badge variant="secondary" className="font-normal">{task.assignee.name}</Badge>
                            )}
                            {task.due_date && (
                               <div className={`flex items-center gap-1 ${new Date(task.due_date) < new Date() ? 'text-red-500 font-medium' : ''}`}>
                                 <Calendar className="h-3 w-3" />
                                 {format(new Date(task.due_date), 'MMM d, yyyy')}
                               </div>
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
                            <div className="mt-1">
                              {togglingTasks.has(task.id) ? (
                                 <div className="h-4 w-4 rounded-sm border border-primary animate-pulse bg-primary/20" />
                              ) : (
                                <Checkbox
                                  checked={true}
                                  onCheckedChange={() => toggleTaskComplete(task)}
                                />
                              )}
                            </div>
                            <div className="flex-1 cursor-pointer" onClick={() => handleTaskClick(task)}>
                              <span className="font-medium line-through">{task.name}</span>
                              <div className="flex gap-2 mt-1 items-center">
                                {task.assignee && (
                                  <Badge variant="secondary" className="ml-0 text-xs">{task.assignee.name}</Badge>
                                )}
                                {task.completed_at && (
                                   <span className="text-xs text-muted-foreground">
                                     Completed {format(new Date(task.completed_at), 'MMM d')}
                                   </span>
                                )}
                              </div>
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

          {/* Files Column - 1/3 width */}
          <div className="space-y-4">
            <FileList
              files={fileManager.files}
              loading={fileManager.loading}
              isAdmin={isAdmin}
              onDownload={fileManager.downloadFile}
              onDelete={fileManager.handleDeleteRequest}
              onViewHistory={fileManager.handleViewHistory}
              title="Project Files"
            />
          </div>
        </div>

        <NewTaskModal
          open={newTaskModalOpen}
          onOpenChange={setNewTaskModalOpen}
          slug={slug}
          projectSlug={projectSlug}
          users={companyUsers}
          onSuccess={fetchTasks}
        />

        {selectedTask && (
          <EditTaskModal
            open={editTaskModalOpen}
            onOpenChange={setEditTaskModalOpen}
            task={selectedTask}
            slug={slug}
            projectSlug={projectSlug}
            users={companyUsers}
            onSuccess={fetchTasks}
            isAdmin={isAdmin}
          />
        )}

        <FileHistoryModal
          file={fileManager.historyFile}
          history={fileManager.historyData}
          isOpen={fileManager.historyModalOpen}
          onClose={fileManager.closeHistoryModal}
        />

        <DeleteFileModal
          file={fileManager.deleteFile}
          isOpen={fileManager.deleteModalOpen}
          isDeleting={fileManager.isDeleting}
          onClose={fileManager.closeDeleteModal}
          onConfirm={fileManager.handleDeleteConfirm}
        />
      </div>
    </>
  )
}
