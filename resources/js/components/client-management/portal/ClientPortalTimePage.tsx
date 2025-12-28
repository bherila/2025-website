import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, ArrowLeft, Clock, Trash2, ChevronDown, ChevronRight, TrendingUp, TrendingDown, AlertCircle, AlertTriangle, Download } from 'lucide-react'
import NewTimeEntryModal from './NewTimeEntryModal'
import ClientPortalNav from './ClientPortalNav'
import type { User, Project, Task } from '@/types/client-management/common'
import type { TimeEntry, MonthlyOpeningBalance, MonthlyClosingBalance, MonthlyData, TimeEntriesResponse } from '@/types/client-management/time-entry'

interface ClientPortalTimePageProps {
  slug: string
  companyName: string
}

function formatMonthYear(yearMonth: string): string {
  const [year, month] = yearMonth.split('-')
  const date = new Date(parseInt(year!), parseInt(month!) - 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

export default function ClientPortalTimePage({ slug, companyName }: ClientPortalTimePageProps) {
  const [data, setData] = useState<TimeEntriesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [newEntryModalOpen, setNewEntryModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [companyUsers, setCompanyUsers] = useState<User[]>([])
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  const isAdmin = currentUser?.id === 1 || currentUser?.user_role === 'Admin'

  useEffect(() => {
    document.title = `Time: ${companyName}`
  }, [companyName])

  useEffect(() => {
    fetchTimeEntries()
    fetchProjects()
    fetchCompanyUsers()
    fetchCurrentUser()
  }, [slug])

  useEffect(() => {
    // Expand first month by default
    if (data?.monthly_data && data.monthly_data.length > 0 && data.monthly_data[0]) {
      setExpandedMonths(new Set([data.monthly_data[0].year_month]))
    }
  }, [data?.monthly_data])

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
    if (!isAdmin) return
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

  const openEditModal = (entry: TimeEntry) => {
    if (!isAdmin) return
    setEditingEntry(entry)
    setNewEntryModalOpen(true)
  }

  const handleModalClose = (open: boolean) => {
    setNewEntryModalOpen(open)
    if (!open) {
      setEditingEntry(null)
    }
  }

  const toggleMonth = (yearMonth: string) => {
    const newExpanded = new Set(expandedMonths)
    if (newExpanded.has(yearMonth)) {
      newExpanded.delete(yearMonth)
    } else {
      newExpanded.add(yearMonth)
    }
    setExpandedMonths(newExpanded)
  }

  const downloadCSV = () => {
    if (!data?.entries || data.entries.length === 0) return
    
    // Create CSV content
    const headers = ['Date', 'Project', 'Task', 'Description', 'Hours', 'Billable', 'User']
    const rows = data.entries.map(entry => [
      entry.date_worked,
      entry.project?.name || '',
      entry.task?.name || '',
      entry.name || '',
      (entry.minutes_worked / 60).toFixed(2),
      entry.is_billable ? 'Yes' : 'No',
      entry.user?.name || ''
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_time_entries.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  // Group entries by month
  const entriesByMonth = data?.entries.reduce((acc, entry) => {
    const yearMonth = entry.date_worked.substring(0, 7) // YYYY-MM
    if (!acc[yearMonth]) acc[yearMonth] = []
    acc[yearMonth].push(entry)
    return acc
  }, {} as Record<string, TimeEntry[]>) || {}

  // Group entries within a month by date
  const groupEntriesByDate = (entries: TimeEntry[]) => {
    return entries.reduce((acc, entry) => {
      const date = new Date(entry.date_worked).toLocaleDateString('en-US', { 
        weekday: 'short',
        month: 'short', 
        day: 'numeric' 
      })
      if (!acc[date]) acc[date] = []
      acc[date].push(entry)
      return acc
    }, {} as Record<string, TimeEntry[]>)
  }

  if (loading) {
    return (
      <>
        <ClientPortalNav slug={slug} companyName={companyName} currentPage="time" />
        <div className="container mx-auto px-8 max-w-6xl">
          <Skeleton className="h-10 w-64 mb-6" />
          <Skeleton className="h-24 w-full mb-6" />
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <ClientPortalNav slug={slug} companyName={companyName} currentPage="time" />
      <div className="container mx-auto px-8 max-w-6xl">
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Time Tracking</h1>
            </div>
            <div className="flex gap-2">
              {data?.entries && data.entries.length > 0 && (
                <Button variant="outline" onClick={downloadCSV}>
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </Button>
              )}
              {isAdmin && (
                <Button onClick={() => setNewEntryModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Time Record
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Summary Bar */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex gap-8 flex-wrap">
              <div>
                <span className="text-sm text-muted-foreground">Total Time:</span>
                <span className="ml-2 font-semibold">{data?.total_time || '0:00'}</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Billable:</span>
                <span className="ml-2 font-semibold text-green-600">{data?.billable_time || '0:00'}</span>
              </div>
              {data?.total_unbilled_hours && data.total_unbilled_hours > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-950 rounded-md border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm text-amber-700 dark:text-amber-300">
                    {formatHours(data.total_unbilled_hours)} pending billing
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

      {(!data?.monthly_data || data.monthly_data.length === 0) ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No time entries yet</h3>
            <p className="text-muted-foreground mb-4">Start tracking your time</p>
            {isAdmin && (
              <Button onClick={() => setNewEntryModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Time Record
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.monthly_data.map(month => {
            const isExpanded = expandedMonths.has(month.year_month)
            const monthEntries = entriesByMonth[month.year_month] || []
            const entriesByDate = groupEntriesByDate(monthEntries)

            return (
              <Card key={month.year_month}>
                {/* Month Header with Opening Balance */}
                <CardHeader 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleMonth(month.year_month)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      <CardTitle className="text-lg">{formatMonthYear(month.year_month)}</CardTitle>
                      <Badge variant="outline" className="ml-2">
                        {month.entries_count} entries
                      </Badge>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-semibold text-lg">{month.formatted_hours}</span>
                      <span className="text-sm text-muted-foreground ml-1">worked</span>
                    </div>
                  </div>

                  {/* Opening Balance Info */}
                  {month.has_agreement && month.opening && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                          <span className="text-muted-foreground">Retainer:</span>
                          <span className="font-medium">{formatHours(month.opening.retainer_hours)}</span>
                        </div>
                        {month.opening.rollover_hours > 0 && (
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-green-500" />
                            <span className="text-muted-foreground">Rollover:</span>
                            <span className="font-medium text-green-600">+{formatHours(month.opening.rollover_hours)}</span>
                          </div>
                        )}
                        {month.opening.expired_hours > 0 && (
                          <div className="flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-orange-500" />
                            <span className="text-muted-foreground">Expired:</span>
                            <span className="font-medium text-orange-600">-{formatHours(month.opening.expired_hours)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary" />
                          <span className="text-muted-foreground">Available:</span>
                          <span className="font-medium">{formatHours(month.opening.total_available)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardHeader>

                {/* Expanded Content */}
                {isExpanded && (
                  <CardContent className="pt-0">
                    {/* Time Entries by Date */}
                    <div className="space-y-4">
                      {Object.entries(entriesByDate).map(([date, entries]) => (
                        <div key={date}>
                          <h4 className="text-sm font-medium text-muted-foreground mb-2">{date}</h4>
                          <div className="space-y-2">
                            {entries.map(entry => (
                              <div 
                                key={entry.id}
                                className={`flex items-center justify-between p-3 rounded-lg border bg-card ${isAdmin ? 'cursor-pointer hover:bg-muted/30 transition-colors' : ''}`}
                                onClick={() => isAdmin && openEditModal(entry)}
                              >
                                <div className="flex items-center gap-4">
                                  <span className="font-mono font-medium w-12">{entry.formatted_time}</span>
                                  <span className="text-muted-foreground text-sm">{entry.job_type}</span>
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                                      {entry.user?.name?.split(' ').map(n => n[0]).join('') || '?'}
                                    </div>
                                    <span className="text-sm">{entry.user?.name || 'Unknown'}</span>
                                  </div>
                                  <div className="text-sm">
                                    {entry.project && (
                                      <a href={`/client/portal/${slug}/project/${entry.project.slug}`} 
                                         className="text-blue-600 hover:underline"
                                         onClick={(e) => e.stopPropagation()}>
                                        {entry.project.name}
                                      </a>
                                    )}
                                    {entry.name && <span className="text-muted-foreground ml-1">- {entry.name}</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={entry.is_billable ? 'default' : 'secondary'} className="text-xs">
                                    {entry.is_billable ? 'BILLABLE' : 'NON-BILLABLE'}
                                  </Badge>
                                  {isAdmin && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        deleteTimeEntry(entry.id)
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Closing Balance */}
                    {month.has_agreement && month.closing && (
                      <div className="mt-6 pt-4 border-t">
                        <h4 className="text-sm font-semibold mb-3">Month End Summary</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          {month.closing.unused_hours > 0 && (
                            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950">
                              <div className="text-green-600 font-medium">{formatHours(month.closing.unused_hours)}</div>
                              <div className="text-xs text-muted-foreground">Unused (rolls over)</div>
                            </div>
                          )}
                          {month.closing.hours_used_from_rollover > 0 && (
                            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
                              <div className="text-blue-600 font-medium">{formatHours(month.closing.hours_used_from_rollover)}</div>
                              <div className="text-xs text-muted-foreground">Rollover used</div>
                            </div>
                          )}
                          {month.closing.remaining_rollover > 0 && (
                            <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950">
                              <div className="text-purple-600 font-medium">{formatHours(month.closing.remaining_rollover)}</div>
                              <div className="text-xs text-muted-foreground">Rollover remaining</div>
                            </div>
                          )}
                          {month.closing.excess_hours > 0 && (
                            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950">
                              <div className="flex items-center gap-1">
                                <AlertCircle className="h-4 w-4 text-red-500" />
                                <span className="text-red-600 font-medium">{formatHours(month.closing.excess_hours)}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">Excess (will be invoiced)</div>
                            </div>
                          )}
                          {month.closing.unused_hours === 0 && month.closing.excess_hours === 0 && (
                            <div className="p-3 rounded-lg bg-muted">
                              <div className="font-medium">0:00</div>
                              <div className="text-xs text-muted-foreground">Balance (exact usage)</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {!month.has_agreement && (
                      <div className="mt-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                              No active agreement for this period
                            </p>
                            {month.unbilled_hours && month.unbilled_hours > 0 ? (
                              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                <strong>{formatHours(month.unbilled_hours)}</strong> of billable hours will be invoiced when a future agreement becomes active.
                              </p>
                            ) : (
                              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                Any billable hours will be invoiced when a future agreement becomes active.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <NewTimeEntryModal
        open={newEntryModalOpen}
        onOpenChange={handleModalClose}
        slug={slug}
        projects={projects}
        users={companyUsers}
        onSuccess={fetchTimeEntries}
        entry={editingEntry}
      />
      </div>
    </>
  )
}
