import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'

interface User {
  id: number
  name: string
  email: string
}

interface NewTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  projectSlug: string
  users: User[]
  onSuccess: () => void
}

export default function NewTaskModal({ open, onOpenChange, slug, projectSlug, users, onSuccess }: NewTaskModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [isHighPriority, setIsHighPriority] = useState(false)
  const [isHiddenFromClients, setIsHiddenFromClients] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/client/portal/${slug}/projects/${projectSlug}/tasks`, {
        method: 'POST',
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
        setName('')
        setDescription('')
        setDueDate('')
        setAssigneeId('')
        setIsHighPriority(false)
        setIsHiddenFromClients(false)
      } else {
        const data = await response.json()
        setError(data.message || 'Failed to create task')
      }
    } catch (error) {
      console.error('Error creating task:', error)
      setError('Failed to create task')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="name">Task name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter task name"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Write a description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional task description"
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="assignee">Assignee</Label>
              <select
                id="assignee"
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
              <Label htmlFor="duedate">Due Date</Label>
              <Input
                id="duedate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="hidden"
                checked={isHiddenFromClients}
                onCheckedChange={(checked) => setIsHiddenFromClients(checked as boolean)}
              />
              <Label htmlFor="hidden" className="font-normal cursor-pointer">
                Hidden from clients
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="priority"
                checked={isHighPriority}
                onCheckedChange={(checked) => setIsHighPriority(checked as boolean)}
              />
              <Label htmlFor="priority" className="font-normal cursor-pointer">
                High priority
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Adding...' : 'Add Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
