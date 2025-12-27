import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import type { User, Project, Task } from '@/types/client-management/common'
import type { TimeEntry } from '@/types/client-management/time-entry'

interface NewTimeEntryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  projects: Project[]
  users: User[]
  onSuccess: () => void
  entry?: TimeEntry | null
}

export default function NewTimeEntryModal({ open, onOpenChange, slug, projects, users, onSuccess, entry }: NewTimeEntryModalProps) {
  const [time, setTime] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [userId, setUserId] = useState('')
  const [dateWorked, setDateWorked] = useState(new Date().toISOString().split('T')[0])
  const [jobType, setJobType] = useState('Software Development')
  const [isBillable, setIsBillable] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  // Fetch current user
  useEffect(() => {
    fetch('/api/user')
      .then(response => response.json())
      .then(data => setCurrentUser(data))
      .catch(error => console.error('Error fetching current user:', error))
  }, [])

  // Initialize state from entry if in edit mode
  useEffect(() => {
    if (entry && open) {
      setTime(entry.formatted_time || '')
      setDescription(entry.name || '')
      setProjectId(entry.project?.id.toString() || '')
      setUserId(entry.user?.id.toString() || '')
      setDateWorked(entry.date_worked ? entry.date_worked.split(' ')[0]! : new Date().toISOString().split('T')[0])
      setJobType(entry.job_type || 'Software Development')
      setIsBillable(entry.is_billable ?? true)
    } else if (open) {
      // Reset for new entry
      setTime('')
      setDescription('')
      setUserId(currentUser?.id.toString() || '')
      setDateWorked(new Date().toISOString().split('T')[0])
      setJobType('Software Development')
      setIsBillable(true)
      // Automatically select project if only one exists
      if (projects.length === 1) {
        setProjectId(projects[0]!.id.toString())
      } else {
        setProjectId('')
      }
    }
  }, [entry, open, currentUser, projects])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!time.trim() || !projectId) return

    setLoading(true)
    setError(null)
    
    try {
      const url = entry 
        ? `/api/client/portal/${slug}/time-entries/${entry.id}`
        : `/api/client/portal/${slug}/time-entries`
      
      const method = entry ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        },
        body: JSON.stringify({ 
          time,
          name: description,
          project_id: parseInt(projectId),
          user_id: userId ? parseInt(userId) : null,
          date_worked: dateWorked,
          job_type: jobType,
          is_billable: isBillable,
        })
      })

      if (response.ok) {
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await response.json()
        if (data.errors) {
          const errorMessages = Object.values(data.errors).flat().join('; ')
          setError(errorMessages)
        } else {
          setError(data.message || `Failed to ${entry ? 'update' : 'create'} time entry`)
        }
      }
    } catch (error) {
      console.error(`Error ${entry ? 'updating' : 'creating'} time entry:`, error)
      setError(`Failed to ${entry ? 'update' : 'create'} time entry`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entry ? 'Edit Time Record' : 'New Time Record'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="time">Enter time (e.g. 1:30 or 1.5) *</Label>
              <Input
                id="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="1:30 or 1.5"
                required
                autoFocus={!entry}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="project">Project *</Label>
              <select
                id="project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              >
                <option value="">Select project...</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user">User</Label>
              <select
                id="user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select user...</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="jobType">Job Type</Label>
              <select
                id="jobType"
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="Software Development">Software Development</option>
                <option value="Design">Design</option>
                <option value="Project Management">Project Management</option>
                <option value="Meeting">Meeting</option>
                <option value="Support">Support</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={dateWorked}
                onChange={(e) => setDateWorked(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="billable"
              checked={isBillable}
              onCheckedChange={(checked) => setIsBillable(checked as boolean)}
            />
            <Label htmlFor="billable" className="font-normal cursor-pointer">
              Billable
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !time.trim() || !projectId}>
              {loading ? 'Saving...' : (entry ? 'Save Changes' : 'Add Time Record')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}