'use client'

import type { LucideIcon } from 'lucide-react'
import { ArrowDownUp, CalendarDays, CircleDollarSign, ReceiptText, WalletCards } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import {
  getEffectiveYear,
  YEAR_CHANGED_EVENT,
  type YearSelection,
} from '@/lib/financeRouteBuilder'
import { formatCurrency } from '@/lib/formatCurrency'

interface Totals {
  total_volume: number
  total_commission: number
  total_fee: number
}

interface SymbolSummaryItem {
  t_symbol: string
  total_amount: number
}

interface MonthSummaryItem {
  month: string
  total_amount: number
}

interface SummaryData {
  totals: Totals
  symbolSummary: SymbolSummaryItem[]
  monthSummary: MonthSummaryItem[]
}

interface SummaryMetric {
  label: string
  value: number
  icon: LucideIcon
  testId: string
}

interface SummaryMetricCardProps extends SummaryMetric {
  periodLabel: string
}

function periodLabel(year: YearSelection): string {
  return year === 'all' ? 'All years' : String(year)
}

function amountToneClassName(value: number): string {
  if (value < 0) {
    return 'text-destructive'
  }

  if (value === 0) {
    return 'text-muted-foreground'
  }

  return 'text-foreground'
}

function SummaryMetricCard({ label, value, icon: Icon, testId, periodLabel: labelPeriod }: SummaryMetricCardProps) {
  return (
    <Card className="rounded-lg py-4">
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/40">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="truncate">{label}</span>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{labelPeriod}</span>
        </div>
        <div
          className={`mt-4 text-2xl font-semibold tabular-nums ${amountToneClassName(value)}`}
          data-testid={testId}
        >
          {formatCurrency(value)}
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyTableRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  )
}

export default function SummaryClient({ id }: { id: number }) {
  const [data, setData] = useState<SummaryData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState<YearSelection | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const updateYear = () => {
      const effective = getEffectiveYear(id)
      setSelectedYear(effective)
    }

    updateYear()

    const handleYearChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ accountId: number; year: YearSelection }>
      if (customEvent.detail.accountId === id) {
        setSelectedYear(customEvent.detail.year)
      }
    }

    window.addEventListener(YEAR_CHANGED_EVENT, handleYearChange)

    return () => {
      window.removeEventListener(YEAR_CHANGED_EVENT, handleYearChange)
    }
  }, [id])

  const fetchSummary = useCallback(async () => {
    if (selectedYear === null) {
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const yearParam = selectedYear !== 'all' ? `?year=${selectedYear}` : ''
      const result = await fetchWrapper.get(`/api/finance/${id}/summary${yearParam}`)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load summary')
    } finally {
      setIsLoading(false)
    }
  }, [id, selectedYear])

  useEffect(() => {
    if (selectedYear !== null) {
      fetchSummary()
    }
  }, [fetchSummary, selectedYear])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="large" />
        <span className="ml-2">Loading summary...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-destructive">
        Error: {error}
      </div>
    )
  }

  if (!data || selectedYear === null) {
    return <div className="p-4">No data available</div>
  }

  const { totals, symbolSummary, monthSummary } = data
  const currentPeriodLabel = periodLabel(selectedYear)
  const metrics: SummaryMetric[] = [
    {
      label: 'Total Volume',
      value: totals.total_volume,
      icon: ArrowDownUp,
      testId: 'summary-total-volume',
    },
    {
      label: 'Commissions',
      value: totals.total_commission,
      icon: ReceiptText,
      testId: 'summary-total-commission',
    },
    {
      label: 'Fees',
      value: totals.total_fee,
      icon: CircleDollarSign,
      testId: 'summary-total-fee',
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3" aria-label="Account totals">
        {metrics.map((metric) => (
          <SummaryMetricCard
            key={metric.label}
            {...metric}
            periodLabel={currentPeriodLabel}
          />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="rounded-lg">
          <CardHeader className="flex flex-row items-center gap-2">
            <WalletCards className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle>By Symbol</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-end">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {symbolSummary.length === 0 ? (
                  <EmptyTableRow colSpan={2} message="No symbol activity for this period." />
                ) : symbolSummary.map(({ t_symbol, total_amount }) => (
                  <TableRow key={t_symbol}>
                    <TableCell>{t_symbol}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatCurrency(total_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader className="flex flex-row items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle>By Month</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-end">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthSummary.length === 0 ? (
                  <EmptyTableRow colSpan={2} message="No monthly activity for this period." />
                ) : monthSummary.map(({ month, total_amount }) => (
                  <TableRow key={month}>
                    <TableCell>{month}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatCurrency(total_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
