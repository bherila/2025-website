import { ChevronDown, ChevronRight, Clock, Download, Info, Pencil, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { Project, User } from '@/client-management/types/common'
import type { TimeEntriesResponse, TimeEntry } from '@/client-management/types/time-entry'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TooltipProvider } from '@/components/ui/tooltip'
import { useIsUserAdmin } from '@/hooks/useAppInitialData'
import { formatHours } from '@/lib/formatHours'

import type { SummaryMetric } from '../shared/time/MetricGrid'
import { MetricGrid } from '../shared/time/MetricGrid'
import ClientPortalNav from './ClientPortalNav'
import NewTimeEntryModal from './NewTimeEntryModal'
import TimeEntryListItem from './TimeEntryListItem'
import TimeTrackingMonthSummaryRow from './TimeTrackingMonthSummaryRow'

interface ClientPortalTimePageProps {
  slug: string
  companyName: string
  companyId: number
  initialCompanyUsers?: User[]
  initialProjects?: Project[]
}

function formatMonthYear(yearMonth: string): string {
// ... existing formatMonthYear function ...
  const [year, month] = yearMonth.split('-')
  const date = new Date(parseInt(year!), parseInt(month!) - 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function ClientPortalTimePage({ slug, companyName, companyId, initialCompanyUsers, initialProjects }: ClientPortalTimePageProps) {
  const [data, setData] = useState<TimeEntriesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [newEntryModalOpen, setNewEntryModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [projects, setProjects] = useState<Project[]>(initialProjects ?? [])
  const [companyUsers, setCompanyUsers] = useState<User[]>(initialCompanyUsers ?? [])
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const isAdmin = useIsUserAdmin()

  useEffect(() => {
    document.title = `Time: ${companyName}`
  }, [companyName])

  const fetchTimeEntries = useCallback(async () => {
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
  }, [slug])

  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}/projects`)
      if (response.ok) {
        const data = await response.json()
        setProjects(data)
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    }
  }, [slug])

  const fetchCompanyUsers = useCallback(async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}`)
      if (response.ok) {
        const data = await response.json()
        setCompanyUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error fetching company users:', error)
    }
  }, [slug])

  useEffect(() => {
    fetchTimeEntries()
    // Only fetch projects if the host did not provide hydrated projects
    if (initialProjects === undefined) {
      fetchProjects()
    }
    // Only fetch company users if the host did not provide hydrated company users
    if (initialCompanyUsers === undefined) {
      fetchCompanyUsers()
    }
  }, [fetchTimeEntries, fetchProjects, fetchCompanyUsers, initialCompanyUsers, initialProjects])

  useEffect(() => {
    // Expand first month by default
    if (data?.monthly_data && data.monthly_data.length > 0 && data.monthly_data[0]) {
      setExpandedMonths(new Set([data.monthly_data[0].year_month]))
    }
  }, [data?.monthly_data])

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
    const headers = ['Date', 'Project', 'Task', 'Description', 'Hours', 'Minutes', 'Billable', 'User']
    const rows = data.entries.map(entry => [
      entry.date_worked,
      entry.project?.name || '',
      entry.task?.name || '',
      entry.name || '',
      Math.floor(entry.minutes_worked / 60),
      entry.minutes_worked % 60,
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

  const summaryMetrics: SummaryMetric[] = [
    {
      key: 'total-time',
      title: 'Total Time',
      value: data?.total_time || '0:00',
      icon: Clock,
    },
    {
      key: 'billable-hours',
      title: 'Billable Hours',
      value: data?.billable_time || '0:00',
      tone: 'green',
      icon: Clock,
    },
    ...(data?.total_unbilled_hours && data.total_unbilled_hours > 0
      ? [{
          key: 'pending-billing',
          title: 'Pending Billing',
          value: formatHours(data.total_unbilled_hours),
          tone: 'blue' as const,
          icon: Info,
          helpText: (
            <p className="text-[10px] opacity-80 mt-1 leading-tight font-medium">
              Billable hours from periods without an active agreement.
            </p>
          ),
        }]
      : []),
  ]

  if (loading) {
    return (
      <TooltipProvider>
        <>
          <ClientPortalNav slug={slug} companyName={companyName} companyId={companyId} currentPage="time" projects={projects} />
          <div className="mx-auto px-4 max-w-7xl">
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
        <ClientPortalNav slug={slug} companyName={companyName} companyId={companyId} currentPage="time" projects={projects} />
        <div className="mx-auto px-4 max-w-7xl">
          <div className="mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold">Time Records</h1>
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
            <MetricGrid metrics={summaryMetrics} />
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
                const monthlyRetainer = month.has_agreement && month.opening ? month.opening.retainer_hours : undefined
                const negativeOffsetThisMonth = month.has_agreement && month.opening ? month.opening.negative_offset : undefined
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
                      {month.has_agreement && (
                        <TimeTrackingMonthSummaryRow
                          displayMode="time_page"
                          monthlyRetainer={monthlyRetainer}
                          negativeOffsetThisMonth={negativeOffsetThisMonth}
                          openingAvailable={openingAvailable}
                          preAgreementHoursApplied={month.pre_agreement_hours_applied}
                          hoursWorked={month.hours_worked}
                          hoursUsedFromRollover={month.closing?.hours_used_from_rollover}
                          excessHours={month.closing?.excess_hours}
                          negativeBalance={month.closing?.negative_balance}
                          remainingPool={remainingPool}
                          catchUpHoursBilled={month.catch_up_hours_billed}
                          startingUnusedHours={month.next_month_starting_unused ?? undefined}
                          startingNegativeHours={month.next_month_starting_negative ?? undefined}
                        />
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
                                  <TimeEntryListItem
                                    key={entry.id}
                                    entry={entry}
                                    slug={slug}
                                    showDate={showDate}
                                    showProject={showProject}
                                    onEdit={isAdmin ? openEditModal : undefined}
                                  />
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
