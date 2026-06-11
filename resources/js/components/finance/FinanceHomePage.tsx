'use client'

import {
  AlertCircle,
  BookOpen,
  Briefcase,
  CheckSquare,
  FileText,
  Layers,
  List,
  Receipt,
  RefreshCw,
  Tags,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import MainTitle from '@/components/MainTitle'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchWrapper } from '@/fetchWrapper'
import type { FinanceAction, FinanceOnboardingSummary, FinanceReadinessSection } from '@/types/finance/onboarding-summary'
import { financeOnboardingSummarySchema } from '@/types/finance/onboarding-summary'

// ── URL helpers ───────────────────────────────────────────────────────────────

function getUrlParam(key: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(key)
}

function setUrlParam(key: string, value: string) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (value) {
    params.set(key, value)
  } else {
    params.delete(key)
  }
  window.history.replaceState(null, '', `?${params.toString()}`)
}

// ── icon map ──────────────────────────────────────────────────────────────────

function sectionIcon(id: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    accounts: <Wallet className="h-4 w-4" />,
    transactions: <List className="h-4 w-4" />,
    documents: <FileText className="h-4 w-4" />,
    employment: <Briefcase className="h-4 w-4" />,
    payslips: <Receipt className="h-4 w-4" />,
    rsu: <TrendingUp className="h-4 w-4" />,
    k1_basis: <BookOpen className="h-4 w-4" />,
    lots: <Layers className="h-4 w-4" />,
    carryovers: <RefreshCw className="h-4 w-4" />,
    categorization: <Tags className="h-4 w-4" />,
    tax_preview: <CheckSquare className="h-4 w-4" />,
  }
  return icons[id] ?? <FileText className="h-4 w-4" />
}

// ── sub-components ────────────────────────────────────────────────────────────

function SectionListItem({ section }: { section: FinanceReadinessSection }) {
  if (section.status === 'no_access') {
    return (
      <li
        className="flex items-center gap-2 text-sm text-muted-foreground"
        data-testid={`section-${section.id}`}
      >
        {sectionIcon(section.id)}
        <span>{section.title}</span>
      </li>
    )
  }

  return (
    <li className="flex items-center gap-2 text-sm" data-testid={`section-${section.id}`}>
      {sectionIcon(section.id)}
      <span>{section.title}</span>
      {section.summary ? (
        <span className="ml-auto text-xs text-muted-foreground" data-testid={`section-${section.id}-summary`}>
          {section.summary}
        </span>
      ) : null}
    </li>
  )
}

function PrimaryActionButton({ action }: { action: FinanceAction }) {
  return (
    <li>
      <Button variant={action.kind === 'primary' ? 'default' : 'outline'} asChild>
        <a href={action.href} className="flex items-center gap-2">
          {action.label}
        </a>
      </Button>
    </li>
  )
}

// ── loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" aria-label="Loading Finance Dashboard">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function FinanceHomePage() {
  const [summary, setSummary] = useState<FinanceOnboardingSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const fromUrl = getUrlParam('year')
    if (fromUrl) {
      const parsed = parseInt(fromUrl, 10)
      if (!isNaN(parsed)) return parsed
    }
    return new Date().getFullYear()
  })

  const requestSeqRef = useRef(0)

  const fetchSummary = useCallback(async (year: number) => {
    requestSeqRef.current += 1
    const requestId = requestSeqRef.current
    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchWrapper.get(`/api/finance/onboarding-summary?year=${year}`)
      if (requestId !== requestSeqRef.current) return
      const parsed = financeOnboardingSummarySchema.parse(data)
      setSummary(parsed)
    } catch {
      if (requestId !== requestSeqRef.current) return
      setError('Failed to load Finance Dashboard. Please try again.')
      setSummary(null)
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    fetchSummary(selectedYear)
  }, [selectedYear, fetchSummary])

  const handleYearChange = (value: string) => {
    const year = parseInt(value, 10)
    if (!isNaN(year)) {
      setSelectedYear(year)
      setUrlParam('year', value)
    }
  }

  if (isLoading) {
    return <LoadingSkeleton />
  }

  const allSections = summary?.sections ?? []
  const warningsAndPending = summary?.warnings ?? []
  const primaryActions = summary?.primaryActions ?? []
  const availableYears = summary?.availableYears ?? [selectedYear]

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <MainTitle>Finance Dashboard</MainTitle>
        <Select value={String(selectedYear)} onValueChange={handleYearChange}>
          <SelectTrigger className="w-32" aria-label="Select year">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map((year) => (
              <SelectItem key={year} value={String(year)}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unable to load dashboard</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={() => fetchSummary(selectedYear)}>
                <RefreshCw className="mr-2 h-3 w-3" />
                Retry
              </Button>
              <a href="/finance/accounts" className="text-sm underline">
                Accounts
              </a>
              <a href="/finance/documents" className="text-sm underline">
                Documents
              </a>
              <a href="/finance/tax-preview" className="text-sm underline">
                Tax Preview
              </a>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Setup Checklist */}
            <Card>
              <CardHeader>
                <CardTitle>Setup checklist</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2" aria-label="Setup checklist">
                  {allSections.map((section) => (
                    <SectionListItem key={section.id} section={section} />
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Recent and pending work */}
            <Card>
              <CardHeader>
                <CardTitle>Recent and pending work</CardTitle>
              </CardHeader>
              <CardContent>
                {warningsAndPending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending work.</p>
                ) : (
                  <ul className="space-y-2" aria-label="Recent and pending work">
                    {warningsAndPending.map((warning) => (
                      <li
                        key={warning.id}
                        className="flex items-start gap-2 text-sm"
                        data-testid={`warning-${warning.id}`}
                      >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        {warning.href ? (
                          <a href={warning.href} className="underline">
                            {warning.message}
                          </a>
                        ) : (
                          <span>{warning.message}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Primary actions */}
          {primaryActions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Primary actions</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-3" aria-label="Primary actions">
                  {primaryActions.map((action) => (
                    <PrimaryActionButton key={action.id} action={action} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}
