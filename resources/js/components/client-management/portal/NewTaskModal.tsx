import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter,DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useIsUserAdmin } from '@/hooks/useAppInitialData'

import { TaskFormFields } from './TaskFormFields'

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
  const isAdmin = useIsUserAdmin()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [isHighPriority, setIsHighPriority] = useState(false)
  const [isHiddenFromClients, setIsHiddenFromClients] = useState(false)
  const [milestonePrice, setMilestonePrice] = useState('0.00')
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
          milestone_price: parseFloat(milestonePrice) || 0,
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
        setMilestonePrice('0.00')
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
          
          <TaskFormFields
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            dueDate={dueDate}
            setDueDate={setDueDate}
            assigneeId={assigneeId}
            setAssigneeId={setAssigneeId}
            isHighPriority={isHighPriority}
            setIsHighPriority={setIsHighPriority}
            isHiddenFromClients={isHiddenFromClients}
            setIsHiddenFromClients={setIsHiddenFromClients}
            milestonePrice={milestonePrice}
            setMilestonePrice={setMilestonePrice}
            users={users}
            isAdmin={isAdmin}
            autoFocusName={true}
          />

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
