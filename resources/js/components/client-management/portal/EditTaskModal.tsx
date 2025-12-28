import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { format } from 'date-fns'
import { FileList, FileUploadButton, DeleteFileModal, useFileManagement } from '@/components/shared/FileManager'

interface User {
  id: number
  name: string
  email: string
}

interface Task {
  id: number
  name: string
  description: string | null
  due_date: string | null
  completed_at: string | null
  assignee: User | null
  creator: User | null
  is_high_priority: boolean
  is_hidden_from_clients: boolean
  project_id: number
}

interface EditTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task
  slug: string
  projectSlug: string
  users: User[]
  onSuccess: () => void
  isAdmin: boolean
}

export default function EditTaskModal({ open, onOpenChange, task, slug, projectSlug, users, onSuccess, isAdmin }: EditTaskModalProps) {
  const [name, setName] = useState(task.name)
  const [description, setDescription] = useState(task.description || '')
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.split('T')[0] : '')
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id.toString() || '')
  const [isHighPriority, setIsHighPriority] = useState(task.is_high_priority)
  const [isHiddenFromClients, setIsHiddenFromClients] = useState(task.is_hidden_from_clients)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Time Entry State
  const [timeWorked, setTimeWorked] = useState('')
  const [dateWorked, setDateWorked] = useState(new Date().toISOString().split('T')[0])
  const [timeDescription, setTimeDescription] = useState('')
  const [isBillable, setIsBillable] = useState(true)
  const [timeLoading, setTimeLoading] = useState(false)
  const [timeSuccess, setTimeSuccess] = useState(false)

  // File management
  const fileManager = useFileManagement({
    listUrl: `/api/client/portal/${slug}/projects/${projectSlug}/tasks/${task.id}/files`,
    uploadUrl: `/api/client/portal/${slug}/projects/${projectSlug}/tasks/${task.id}/files`,
    downloadUrlPattern: (fileId) => `/api/client/portal/${slug}/projects/${projectSlug}/tasks/${task.id}/files/${fileId}/download`,
    deleteUrlPattern: (fileId) => `/api/client/portal/${slug}/projects/${projectSlug}/tasks/${task.id}/files/${fileId}`,
  })

  useEffect(() => {
    setName(task.name)
    setDescription(task.description || '')
    setDueDate(task.due_date ? task.due_date.split('T')[0] : '')
    setAssigneeId(task.assignee?.id.toString() || '')
    setIsHighPriority(task.is_high_priority)
    setIsHiddenFromClients(task.is_hidden_from_clients)
    fileManager.fetchFiles()
  }, [task])

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/client/portal/${slug}/projects/${projectSlug}/tasks/${task.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        },
        body: JSON.stringify({ 
          name, 
          description,
          due_date: dueDate || null,
          assignee_user_id: assigneeId || null,
          is_high_priority: isHighPriority,
          is_hidden_from_clients: isHiddenFromClients,
        })
      })

      if (response.ok) {
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await response.json()
        setError(data.message || 'Failed to update task')
      }
    } catch (error) {
      console.error('Error updating task:', error)
      setError('Failed to update task')
    } finally {
      setLoading(false)
    }
  }

  const handleLogTime = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!timeWorked) return

    setTimeLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/client/portal/${slug}/time-entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        },
        body: JSON.stringify({ 
          time: timeWorked,
          name: timeDescription,
          project_id: task.project_id,
          task_id: task.id,
          user_id: assigneeId ? parseInt(assigneeId) : null,
          date_worked: dateWorked,
          job_type: 'Software Development', // Default or add selector
          is_billable: isBillable,
        })
      })

      if (response.ok) {
        setTimeSuccess(true)
        setTimeWorked('')
        setTimeDescription('')
        // Reset success message after 3 seconds
        setTimeout(() => setTimeSuccess(false), 3000)
      } else {
        const data = await response.json()
        if (data.errors) {
            const errorMessages = Object.values(data.errors).flat().join('; ')
            setError(errorMessages)
        } else {
            setError(data.message || 'Failed to log time')
        }
      }
    } catch (error) {
      console.error('Error logging time:', error)
      setError('Failed to log time')
    } finally {
      setTimeLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="details">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="time">Log Time</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>
          
          <TabsContent value="details">
            <form onSubmit={handleUpdateTask} className="space-y-4 mt-4">
              {error && !timeSuccess && (
                <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                  {error}
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="edit-name">Task name *</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter task name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Task description"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-assignee">Assignee</Label>
                  <select
                    id="edit-assignee"
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">No Assignee...</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="edit-duedate">Due Date</Label>
                  <Input
                    id="edit-duedate"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-hidden"
                    checked={isHiddenFromClients}
                    onCheckedChange={(checked) => setIsHiddenFromClients(checked as boolean)}
                  />
                  <Label htmlFor="edit-hidden" className="font-normal cursor-pointer">
                    Hidden from clients
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-priority"
                    checked={isHighPriority}
                    onCheckedChange={(checked) => setIsHighPriority(checked as boolean)}
                  />
                  <Label htmlFor="edit-priority" className="font-normal cursor-pointer">
                    High priority
                  </Label>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !name.trim()}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
          
          <TabsContent value="time">
            <form onSubmit={handleLogTime} className="space-y-4 mt-4">
               {timeSuccess && (
                 <div className="text-sm text-green-600 bg-green-50 p-2 rounded border border-green-200">
                   Time logged successfully!
                 </div>
               )}
               {error && (
                 <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                   {error}
                 </div>
               )}

               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <Label htmlFor="time-value">Time (e.g. 1:30 or 1.5)</Label>
                   <Input
                     id="time-value"
                     value={timeWorked}
                     onChange={(e) => setTimeWorked(e.target.value)}
                     placeholder="1:30"
                     required
                     autoFocus
                   />
                 </div>
                 <div className="space-y-2">
                   <Label htmlFor="time-date">Date</Label>
                   <Input
                     id="time-date"
                     type="date"
                     value={dateWorked}
                     onChange={(e) => setDateWorked(e.target.value)}
                     required
                   />
                 </div>
               </div>

               <div className="space-y-2">
                 <Label htmlFor="time-desc">Description</Label>
                 <Textarea
                   id="time-desc"
                   value={timeDescription}
                   onChange={(e) => setTimeDescription(e.target.value)}
                   placeholder="What did you work on?"
                   rows={3}
                 />
               </div>

               <div className="flex items-center space-x-2">
                 <Checkbox
                   id="time-billable"
                   checked={isBillable}
                   onCheckedChange={(checked) => setIsBillable(checked as boolean)}
                 />
                 <Label htmlFor="time-billable" className="font-normal cursor-pointer">
                   Billable
                 </Label>
               </div>

               <DialogFooter>
                 <Button type="submit" disabled={timeLoading || !timeWorked.trim()}>
                   {timeLoading ? 'Logging...' : 'Log Time'}
                 </Button>
               </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="files">
            <div className="space-y-4 mt-4">
              {isAdmin && (
                <div className="flex justify-end">
                  <FileUploadButton onUpload={fileManager.uploadFile} />
                </div>
              )}
              <FileList
                files={fileManager.files}
                loading={fileManager.loading}
                isAdmin={isAdmin}
                onDownload={fileManager.downloadFile}
                onDelete={fileManager.handleDeleteRequest}
                title=""
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>

      <DeleteFileModal
        file={fileManager.deleteFile}
        isOpen={fileManager.deleteModalOpen}
        isDeleting={fileManager.isDeleting}
        onClose={fileManager.closeDeleteModal}
        onConfirm={fileManager.handleDeleteConfirm}
      />
    </Dialog>
  )
}
