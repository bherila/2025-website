import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, ArrowLeft, Clock, MoreHorizontal, Trash2 } from 'lucide-react'
import NewTimeEntryModal from './NewTimeEntryModal'

interface User {
  id: number
  name: string
  email: string
}

interface Project {
  id: number
  name: string
  slug: string
}

interface Task {
  id: number
  name: string
}

interface TimeEntry {
  id: number
  name: string | null
  minutes_worked: number
  formatted_time: string
  date_worked: string
  is_billable: boolean
  job_type: string
  user: User | null
  project: Project | null
  task: Task | null
  created_at: string
}

interface TimeEntriesResponse {
  entries: TimeEntry[]
  total_time: string
  total_minutes: number
  billable_time: string
  billable_minutes: number
}

interface ClientPortalTimePageProps {
  slug: string
  companyName: string
}

export default function ClientPortalTimePage({ slug, companyName }: ClientPortalTimePageProps) {
  const [data, setData] = useState<TimeEntriesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [newEntryModalOpen, setNewEntryModalOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [companyUsers, setCompanyUsers] = useState<User[]>([])

  useEffect(() => {
    fetchTimeEntries()
    fetchProjects()
    fetchCompanyUsers()
  }, [slug])

  const fetchTimeEntries = async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}/time-entries`)
      if (response.ok) {
        const data = await response.json()
        setData(data)
      }
    } catch (error) {
      console.error('Error fetching time entries:', error)
    } finally {
      setLoading(false)
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

  const deleteTimeEntry = async (entryId: number) => {
    if (!confirm('Delete this time entry?')) return
    
    try {
      const response = await fetch(`/api/client/portal/${slug}/time-entries/${entryId}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        }
      })

      if (response.ok) {
        fetchTimeEntries()
      }
    } catch (error) {
      console.error('Error deleting time entry:', error)
    }
  }

  // Group entries by date
  const entriesByDate = data?.entries.reduce((acc, entry) => {
    const date = new Date(entry.date_worked).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
    if (!acc[date]) acc[date] = []
    acc[date].push(entry)
    return acc
  }, {} as Record<string, TimeEntry[]>) || {}

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <div className="mb-6">
        <Button variant="ghost" className="mb-4" onClick={() => window.location.href = `/client/portal/${slug}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
        
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">{companyName}</p>
            <h1 className="text-3xl font-bold">Time Tracking</h1>
          </div>
          <Button onClick={() => setNewEntryModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Time Record
          </Button>
        </div>
      </div>

      {/* Summary Bar */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex gap-8">
            <div>
              <span className="text-sm text-muted-foreground">Total Time:</span>
              <span className="ml-2 font-semibold">{data?.total_time || '0:00'}</span>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Billable:</span>
              <span className="ml-2 font-semibold text-green-600">{data?.billable_time || '0:00'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {Object.keys(entriesByDate).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No time entries yet</h3>
            <p className="text-muted-foreground mb-4">Start tracking your time</p>
            <Button onClick={() => setNewEntryModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Time Record
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(entriesByDate).map(([date, entries]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{date}</h3>
              <div className="space-y-2">
                {entries.map(entry => (
                  <Card key={entry.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <span className="font-mono font-medium w-12">{entry.formatted_time}</span>
                          <span className="text-muted-foreground">{entry.job_type}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                              {entry.user?.name?.split(' ').map(n => n[0]).join('') || '?'}
                            </div>
                            <span>{entry.user?.name || 'Unknown'}</span>
                          </div>
                          <div className="text-sm">
                            {entry.project && (
                              <a href={`/client/portal/${slug}/project/${entry.project.slug}`} 
                                 className="text-blue-600 hover:underline">
                                {entry.project.name}
                              </a>
                            )}
                            {entry.name && <span className="text-muted-foreground ml-1">- {entry.name}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={entry.is_billable ? 'default' : 'secondary'}>
                            {entry.is_billable ? 'BILLABLE' : 'NON-BILLABLE'}
                          </Badge>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => deleteTimeEntry(entry.id)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <NewTimeEntryModal
        open={newEntryModalOpen}
        onOpenChange={setNewEntryModalOpen}
        slug={slug}
        projects={projects}
        users={companyUsers}
        onSuccess={fetchTimeEntries}
      />
    </div>
  )
}
