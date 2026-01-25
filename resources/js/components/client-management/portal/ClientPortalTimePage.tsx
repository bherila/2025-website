import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, Clock, Pencil, ChevronDown, ChevronRight, Download, Info } from 'lucide-react'
import NewTimeEntryModal from './NewTimeEntryModal'
import ClientPortalNav from './ClientPortalNav'
import type { User, Project } from '@/types/client-management/common'
import type { TimeEntry, TimeEntriesResponse } from '@/types/client-management/time-entry'
import { TooltipProvider } from '@/components/ui/tooltip'
import SummaryTile from '@/components/ui/summary-tile'

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

function abbreviateName(name: string | null | undefined): string {
  if (!name) return 'Unknown'
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[0]} ${parts[1]![0]}.`
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

  if (loading) {
    return (
      <TooltipProvider>
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
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
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
          <div className="mb-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SummaryTile
                title="Total Time"
                icon={Clock}
              >
                {data?.total_time || '0:00'}
              </SummaryTile>

              <SummaryTile
                title="Billable Hours"
                icon={Clock}
                kind="green"
              >
                {data?.billable_time || '0:00'}
              </SummaryTile>

              {data?.total_unbilled_hours && data.total_unbilled_hours > 0 ? (
                <SummaryTile
                  title="Pending Billing"
                  icon={Info}
                  kind="blue"
                >
                  {formatHours(data.total_unbilled_hours)}
                  <p className="text-[10px] opacity-80 mt-1 leading-tight font-medium">Billable hours from periods without an active agreement.</p>
                </SummaryTile>
              ) : null}
            </div>
          </div>

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
                const openingAvailable = month.has_agreement && month.opening ? month.opening.total_available : undefined
                const remainingPool = month.has_agreement && month.closing
                  ? Math.max(0, (month.closing.unused_hours || 0) + (month.closing.remaining_rollover || 0))
                  : undefined

                return (
                  <Card key={month.year_month} className="border-none shadow-none bg-transparent">
                    {/* Month Header with Opening Balance */}
                    <CardHeader
                      className="cursor-pointer hover:bg-muted/50 transition-colors rounded-lg px-0 pb-2"
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
                          <span className="font-semibold text-lg">{month.formatted_hours}</span>
                          <span className="text-sm text-muted-foreground ml-1">worked</span>
                        </div>
                      </div>

                      {/* Monthly Summary Tiles */}
                      {month.has_agreement && typeof remainingPool === 'number' && typeof openingAvailable === 'number' && (
                        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs text-muted-foreground">
                          <SummaryTile
                            title="Contracted Time"
                            kind="green"
                            size="small"
                          >
                            {formatHours(openingAvailable)}
                          </SummaryTile>
                          {month.pre_agreement_hours_applied && month.pre_agreement_hours_applied > 0 ? (
                            <SummaryTile
                              title="Carried in"
                              kind="blue"
                              size="small"
                            >
                              {formatHours(month.pre_agreement_hours_applied)}
                            </SummaryTile>
                          ) : null}
                          <SummaryTile title="Worked" kind="blue" size="small">
                            {formatHours(month.hours_worked)}
                          </SummaryTile>
                          {month.closing && month.closing.hours_used_from_rollover > 0 && (
                            <SummaryTile title="Rollover Used" size="small">
                              {formatHours(month.closing.hours_used_from_rollover)}
                            </SummaryTile>
                          )}
                          {month.closing && month.closing.excess_hours > 0 && (
                            <SummaryTile title="Overage (billed)" kind="red" size="small">
                              {formatHours(month.closing.excess_hours)}
                            </SummaryTile>
                          )}
                          {month.closing && month.closing.negative_balance && month.closing.negative_balance > 0 ? (
                            <SummaryTile title="Overage (carried forward)" kind="red" size="small">
                              {formatHours(month.closing.negative_balance)}
                            </SummaryTile>
                          ) : (
                            <SummaryTile title="Remaining" size="small">
                              {formatHours(Math.max(0, remainingPool ?? 0))}
                            </SummaryTile>
                          )}
                        </div>
                      )}
                    </CardHeader>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <CardContent className="pt-0 px-0">
                        <div className="border border-muted/50 rounded-md overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="w-[110px] py-2">Date</TableHead>
                                <TableHead className="py-2">Description</TableHead>
                                <TableHead className="py-2">User</TableHead>
                                <TableHead className="text-right py-2">Time</TableHead>
                                {isAdmin && (
                                  <TableHead className="w-[40px] py-2 text-right">
                                    <Pencil className="h-3 w-3 ml-auto text-muted-foreground/50" />
                                  </TableHead>
                                )}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {monthEntries.map((entry, index) => {
                                const prevEntry = index > 0 ? monthEntries[index - 1] : null
                                const showDate = !prevEntry || prevEntry.date_worked !== entry.date_worked
                                const showProject = !prevEntry || prevEntry.project?.id !== entry.project?.id || showDate

                                return (
                                  <TableRow
                                    key={entry.id}
                                    className={`group ${isAdmin && !entry.is_invoiced ? 'cursor-pointer' : ''}`}
                                    onClick={() => isAdmin && !entry.is_invoiced && openEditModal(entry)}
                                  >
                                    <TableCell className="py-2 align-top">
                                      {showDate && (
                                        <span className="text-sm font-medium">
                                          {new Date(entry.date_worked).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="py-2 align-top">
                                      <div className="flex flex-col">
                                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-none mb-1">{entry.job_type}</span>
                                        <span className="text-sm leading-tight mb-2">{entry.name || '--'}</span>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          {entry.is_billable && entry.is_invoiced ? (
                                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-green-600 text-green-600 font-bold shrink-0">
                                              INVOICED
                                            </Badge>
                                          ) : (
                                            <Badge variant={entry.is_billable ? 'default' : 'secondary'} className="text-[9px] px-1 py-0 h-3.5 font-bold shrink-0">
                                              {entry.is_billable ? 'BILLABLE' : 'NON-BILLABLE'}
                                            </Badge>
                                          )}
                                          {entry.project && (
                                            <Badge
                                              variant="outline"
                                              className="text-[9px] px-1 py-0 h-3.5 font-medium border-muted-foreground/30 text-muted-foreground shrink-0"
                                            >
                                              {entry.project.name}
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-2 align-top">
                                      <span className="text-sm whitespace-nowrap text-muted-foreground">{abbreviateName(entry.user?.name)}</span>
                                    </TableCell>
                                    <TableCell className="text-right py-2 align-top text-sm">
                                      {entry.formatted_time}
                                    </TableCell>
                                    {isAdmin && (
                                      <TableCell className="py-1 align-top text-right">
                                        {!entry.is_invoiced && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              openEditModal(entry)
                                            }}
                                          >
                                            <Pencil className="h-3 w-3 text-muted-foreground" />
                                          </Button>
                                        )}
                                      </TableCell>
                                    )}
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>

                        {!month.has_agreement && (
                          <div className="mt-4 p-4 rounded-xl bg-blue-50/30 border border-blue-100 shadow-sm dark:bg-blue-900/10 dark:border-blue-800/50 transition-colors">
                            <div className="flex items-start gap-3">
                              <Info className="h-5 w-5 text-blue-700 dark:text-blue-400 mt-0.5" />
                              <div>
                                <p className="text-sm font-bold text-blue-800 dark:text-blue-300">
                                  No active agreement for this period
                                </p>
                                {month.unbilled_hours && month.unbilled_hours > 0 ? (
                                  <p className="text-sm text-blue-700/80 dark:text-blue-400/80 mt-1 font-medium">
                                    <span className="font-bold text-blue-800 dark:text-blue-300">{formatHours(month.unbilled_hours)}</span> of billable hours will be invoiced when a future agreement becomes active.
                                  </p>
                                ) : (
                                  <p className="text-sm text-blue-700/80 dark:text-blue-400/80 mt-1 font-medium">
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
            lastProjectId={data?.entries && data.entries.length > 0 ? data.entries[0]?.project?.id.toString() : undefined}
          />
        </div>
      </>
    </TooltipProvider>
  )
}
