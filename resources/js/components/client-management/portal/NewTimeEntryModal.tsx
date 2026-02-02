import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2 } from 'lucide-react'
import type { User, Project, Task } from '@/types/client-management/common'
import type { TimeEntry } from '@/types/client-management/time-entry'

function getLocalISODate(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseTimeToMinutes(timeString: string): number {
  const str = timeString.trim().toLowerCase()
  
  // h:mm format
  const colonMatch = str.match(/^(\d+):(\d{1,2})$/)
  if (colonMatch) {
    return (parseInt(colonMatch[1]!) * 60) + parseInt(colonMatch[2]!)
  }
  
  // decimal or decimal with h suffix
  const hMatch = str.match(/^(\d*(?:\.\d+)?)h?$/)
  if (hMatch && hMatch[1] !== '') {
    return Math.round(parseFloat(hMatch[1]!) * 60)
  }
  
  return 0
}

function formatMinutesToTime(minutes: number): string {
  if (minutes <= 0) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${m.toString().padStart(2, '0')}`
}

interface NewTimeEntryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  projects: Project[]
  users: User[]
  onSuccess: () => void
  entry?: TimeEntry | null
  lastProjectId?: string | undefined
}

export default function NewTimeEntryModal({ open, onOpenChange, slug, projects, users, onSuccess, entry, lastProjectId }: NewTimeEntryModalProps) {
  const [time, setTime] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [userId, setUserId] = useState('')
  const [dateWorked, setDateWorked] = useState(getLocalISODate())
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
      setDateWorked(entry.date_worked ? entry.date_worked.split(' ')[0]! : getLocalISODate())
      setJobType(entry.job_type || 'Software Development')
      setIsBillable(entry.is_billable ?? true)
    } else if (open) {
      // Reset for new entry
      setTime('')
      setDescription('')
      setUserId(currentUser?.id.toString() || '')
      setDateWorked(getLocalISODate())
      setJobType('Software Development')
      setIsBillable(true)
      
      // Automatically select project if only one exists, or use the last one used
      if (projects.length === 1) {
        setProjectId(projects[0]!.id.toString())
      } else if (lastProjectId && projects.some(p => p.id.toString() === lastProjectId)) {
        setProjectId(lastProjectId)
      } else {
        setProjectId('')
      }
    }
  }, [entry, open, currentUser, projects, lastProjectId])

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

  const handleDelete = async () => {
    if (!entry) return
    if (!confirm('Delete this time entry?')) return
    
    setLoading(true)
    try {
      const response = await fetch(`/api/client/portal/${slug}/time-entries/${entry.id}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        }
      })

      if (response.ok) {
        onSuccess()
        onOpenChange(false)
      }
    } catch (error) {
      console.error('Error deleting time entry:', error)
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
              <Label htmlFor="time">Enter time (e.g. 1:30, 1.5, or 1.5h) *</Label>
              <Input
                id="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="1:30, 1.5, or 1.5h"
                required
                autoFocus={!entry}
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {[ 5, 15 ].map((inc) => (
                  <Button
                    key={inc}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => {
                      const currentMins = parseTimeToMinutes(time)
                      const newMins = Math.max(0, currentMins + inc)
                      setTime(formatMinutesToTime(newMins))
                    }}
                  >
                    {inc > 0 ? `+${inc}` : inc}m
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[10px]"
                  onClick={() => setTime('')}
                >
                  &times;
                </Button>
              </div>
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

          <DialogFooter className="flex justify-between items-center sm:justify-between w-full">
            <div className="flex-1">
              {entry && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDelete}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Record
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !time.trim() || !projectId}>
                {loading ? 'Saving...' : (entry ? 'Save Changes' : 'Add Time Record')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}