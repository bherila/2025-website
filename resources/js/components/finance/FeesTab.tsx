'use client'

import currency from 'currency.js'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { z } from 'zod'

import TransactionDetailsModal from '@/components/finance/TransactionDetailsModal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'
import {
  currentTaxYear,
  type FeeBreakdown,
  type FeeConstants,
  type FeeLineItem,
  type FeesAccount,
  type FeeStatus,
  type K1ReconciliationRow,
  type MonthlyFeeDragPoint,
  type ReconciliationStatus,
  statusClassName,
  statusLabel,
} from '@/lib/finance/feeTypes'
import {
  getEffectiveYear,
  YEAR_CHANGED_EVENT,
  type YearSelection,
} from '@/lib/financeRouteBuilder'
import { formatCurrency } from '@/lib/formatCurrency'
import { cn } from '@/lib/utils'

const expectedFeePayloadSchema = z.object({
  expectedFeePct: z.preprocess(parseNullableNumber, z.number().min(0).max(999.9999).nullable()),
  expectedFeeFlat: z.preprocess(parseNullableNumber, z.number().min(0).nullable()),
  expectedFeeNotes: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().max(255).nullable()
  ),
})

type ExpectedFeePayload = z.infer<typeof expectedFeePayloadSchema>

export interface FeesTabData {
  year: number
  account: FeesAccount
  actual: {
    total: number
    by_characteristic: FeeBreakdown
    line_items: FeeLineItem[]
  }
  expected: {
    total: number
    has_expectation: boolean
  }
  delta: number
  status: FeeStatus | null
  monthly_fee_drag: MonthlyFeeDragPoint[]
  reconciliation: K1ReconciliationRow[]
  constants: FeeConstants
}

interface FeesTabProps {
  accountId: number
  initialData?: FeesTabData
}

interface FeeDragLineChartProps {
  series: MonthlyFeeDragPoint[]
}

export interface FeeDragChartPoint extends MonthlyFeeDragPoint {
  grossReturnPctActual: number | null
  netReturnPctActual: number | null
  grossReturnPctProjected: number | null
  netReturnPctProjected: number | null
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function effectiveNumericYear(accountId: number): number {
  const year = getEffectiveYear(accountId)
  return year === 'all' ? currentTaxYear() : year
}

export function feeStatusFromAmounts(
  actual: number,
  expected: number,
  hasExpectation: boolean,
  tolerance: number
): FeeStatus | null {
  if (!hasExpectation) return null
  if (expected === 0) {
    if (actual === 0) return 'on_target'
    return actual < 0 ? 'under' : 'over'
  }

  const toleranceAmount = currency(expected).multiply(tolerance).value
  if (actual < currency(expected).subtract(toleranceAmount).value) return 'under'
  if (actual > currency(expected).add(toleranceAmount).value) return 'over'

  return 'on_target'
}

function reconciliationLabel(status: ReconciliationStatus): string {
  if (status === 'match') return 'Match'
  if (status === 'mismatch') return 'Mismatch'
  return '13ZZ unclassified'
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-')
  const date = new Date(Number(year), Number(monthNumber) - 1, 1)
  return date.toLocaleString(undefined, { month: 'short' })
}

function numericInputValue(value: number | null): string {
  return value === null ? '' : String(value)
}

function formatReturnPct(value: number): string {
  if (!Number.isFinite(value)) return '-'

  return `${value.toFixed(2)}%`
}

export function feeDragChartData(series: MonthlyFeeDragPoint[]): FeeDragChartPoint[] {
  const firstProjectedIndex = series.findIndex((point) => point.is_projected)

  return series.map((point, index) => {
    const anchorsProjection = firstProjectedIndex > 0 && index === firstProjectedIndex - 1

    return {
      ...point,
      grossReturnPctActual: point.is_projected ? null : point.gross_return_pct,
      netReturnPctActual: point.is_projected ? null : point.net_return_pct,
      grossReturnPctProjected: point.is_projected || anchorsProjection ? point.gross_return_pct : null,
      netReturnPctProjected: point.is_projected || anchorsProjection ? point.net_return_pct : null,
    }
  })
}

export function FeeDragLineChart({ series }: FeeDragLineChartProps) {
  const chartData = useMemo(() => feeDragChartData(series), [series])

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 12, right: 20, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#737373" opacity={0.3} />
        <XAxis dataKey="month" tickFormatter={formatMonth} />
        <YAxis tickFormatter={(value) => formatReturnPct(Number(value))} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1f2937',
            border: 'none',
            borderRadius: '6px',
            color: '#ffffff',
          }}
          formatter={(value, name) => [formatReturnPct(Number(value)), String(name)]}
          labelFormatter={(label) => String(label)}
        />
        <Line type="monotone" dataKey="grossReturnPctActual" name="Gross return" stroke="#0f766e" strokeWidth={2} dot={false} connectNulls={false} />
        <Line type="monotone" dataKey="netReturnPctActual" name="Net of fees" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls={false} />
        <Line type="monotone" dataKey="grossReturnPctProjected" name="Gross return projection" stroke="#0f766e" strokeWidth={2} dot={false} connectNulls={false} strokeDasharray="4 4" />
        <Line type="monotone" dataKey="netReturnPctProjected" name="Net of fees projection" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls={false} strokeDasharray="4 4" />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default function FeesTab({ accountId, initialData }: FeesTabProps) {
  const [selectedYear, setSelectedYear] = useState<number>(() => initialData?.year ?? effectiveNumericYear(accountId))
  const [data, setData] = useState<FeesTabData | null>(initialData ?? null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!initialData)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [showReconciliation, setShowReconciliation] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<FeeLineItem | null>(null)
  const [form, setForm] = useState({
    expectedFeePct: '',
    expectedFeeFlat: '',
    expectedFeeNotes: '',
  })

  const loadFees = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchWrapper.get(`/api/finance/${accountId}/fees?year=${selectedYear}`) as FeesTabData
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [accountId, selectedYear])

  useEffect(() => {
    if (!initialData || selectedYear !== initialData.year) {
      loadFees()
    }
  }, [initialData, loadFees, selectedYear])

  useEffect(() => {
    if (!data) return
    setForm({
      expectedFeePct: numericInputValue(data.account.expected_fee_pct),
      expectedFeeFlat: numericInputValue(data.account.expected_fee_flat),
      expectedFeeNotes: data.account.expected_fee_notes ?? '',
    })
    setIsDirty(false)
  }, [data])

  useEffect(() => {
    const handleYearChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ accountId: number; year: YearSelection }>
      if (customEvent.detail.accountId === accountId) {
        setSelectedYear(customEvent.detail.year === 'all' ? currentTaxYear() : customEvent.detail.year)
      }
    }

    window.addEventListener(YEAR_CHANGED_EVENT, handleYearChange)
    return () => window.removeEventListener(YEAR_CHANGED_EVENT, handleYearChange)
  }, [accountId])

  const resolvedStatus = useMemo(
    () => data ? feeStatusFromAmounts(
      data.actual.total,
      data.expected.total,
      data.expected.has_expectation,
      data.constants.on_target_tolerance
    ) : null,
    [data]
  )

  const saveExpectedFees = async () => {
    if (!isDirty || isSaving) return

    const payload = expectedFeePayloadSchema.parse(form) satisfies ExpectedFeePayload
    setIsSaving(true)
    setError(null)
    try {
      await fetchWrapper.post(`/api/finance/${accountId}/update-flags`, payload)
      await loadFees()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSaving(false)
    }
  }

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setIsDirty(true)
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="large" />
        <span className="ml-2">Loading fees...</span>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertDescription>{error ?? 'Unable to load fees.'}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Expected Fees</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="expectedFeePct">Annual AUM fee</Label>
              <Input
                id="expectedFeePct"
                inputMode="decimal"
                value={form.expectedFeePct}
                onChange={(event) => updateField('expectedFeePct', event.target.value)}
                placeholder="1.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expectedFeeFlat">Flat annual fee</Label>
              <Input
                id="expectedFeeFlat"
                inputMode="decimal"
                value={form.expectedFeeFlat}
                onChange={(event) => updateField('expectedFeeFlat', event.target.value)}
                placeholder="100.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expectedFeeNotes">Notes</Label>
              <Textarea
                id="expectedFeeNotes"
                value={form.expectedFeeNotes}
                onChange={(event) => updateField('expectedFeeNotes', event.target.value)}
                rows={2}
              />
            </div>
            <div className="md:col-span-3">
              <Button type="button" onClick={saveExpectedFees} disabled={!isDirty || isSaving} className="gap-2">
                {isSaving ? <Spinner size="small" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>{selectedYear} Summary</CardTitle>
            {resolvedStatus && (
              <Badge variant="outline" className={cn('rounded-md', statusClassName(resolvedStatus))}>
                {statusLabel(resolvedStatus)}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Actual fees</TableCell>
                  <TableCell className="text-end font-medium">{formatCurrency(data.actual.total)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Schedule E</TableCell>
                  <TableCell className="text-end">{formatCurrency(data.actual.by_characteristic.fee_schE)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Personal</TableCell>
                  <TableCell className="text-end">{formatCurrency(data.actual.by_characteristic.fee_irc67g)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Untagged</TableCell>
                  <TableCell className="text-end">{formatCurrency(data.actual.by_characteristic.untagged)}</TableCell>
                </TableRow>
                {data.expected.has_expectation && (
                  <>
                    <TableRow>
                      <TableCell>Expected fees</TableCell>
                      <TableCell className="text-end">{formatCurrency(data.expected.total)}</TableCell>
                    </TableRow>
                    <TableRow data-testid="fee-delta-row">
                      <TableCell>Delta</TableCell>
                      <TableCell className="text-end">{formatCurrency(currency(data.actual.total).subtract(data.expected.total).value)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Fee Drag</CardTitle>
        </CardHeader>
        <CardContent>
          <FeeDragLineChart series={data.monthly_fee_drag} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fee Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Tax Characteristic</TableHead>
                <TableHead className="text-end">Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.actual.line_items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">No fee transactions for this year.</TableCell>
                </TableRow>
              ) : data.actual.line_items.map((row) => (
                <TableRow key={row.t_id} className="cursor-pointer" onClick={() => setSelectedTransaction(row)}>
                  <TableCell>{row.t_date}</TableCell>
                  <TableCell>{row.t_description || row.t_type || 'Fee'}</TableCell>
                  <TableCell>{row.tax_characteristic ?? 'Untagged'}</TableCell>
                  <TableCell className="text-end">{formatCurrency(row.fee_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.reconciliation.length > 0 && (
        <Card>
          <CardHeader>
            <Button
              type="button"
              variant="ghost"
              className="w-fit gap-2 px-0"
              onClick={() => setShowReconciliation((current) => !current)}
            >
              {showReconciliation ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="text-base font-semibold">K-1 Reconciliation</span>
            </Button>
          </CardHeader>
          {showReconciliation && (
            <CardContent>
              {data.reconciliation.some((row) => row.status === 'unclassified') && (
                <Alert className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>Review this K-1 to classify the 13ZZ fee subtotal.</AlertDescription>
                </Alert>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead className="text-end">K-1 Sch E</TableHead>
                    <TableHead className="text-end">K-1 Personal</TableHead>
                    <TableHead className="text-end">Statement Sch E</TableHead>
                    <TableHead className="text-end">Statement Personal</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reconciliation.map((row) => (
                    <TableRow key={`${row.tax_document_id}-${row.entity_name}`}>
                      <TableCell>{row.entity_name}</TableCell>
                      <TableCell className="text-end">{formatCurrency(row.k1_fees_schE)}</TableCell>
                      <TableCell className="text-end">{formatCurrency(row.k1_fees_irc67g)}</TableCell>
                      <TableCell className="text-end">{formatCurrency(row.statement_fees_schE)}</TableCell>
                      <TableCell className="text-end">{formatCurrency(row.statement_fees_irc67g)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          'rounded-md',
                          row.status === 'match' && 'border-emerald-600 text-emerald-700 dark:text-emerald-300',
                          row.status === 'mismatch' && 'border-red-600 text-red-700 dark:text-red-300',
                          row.status === 'unclassified' && 'border-amber-600 text-amber-700 dark:text-amber-300',
                        )}>
                          {row.status === 'match' && <CheckCircle2 className="h-3 w-3" />}
                          {reconciliationLabel(row.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}

      {selectedTransaction && (
        <TransactionDetailsModal
          transaction={selectedTransaction}
          isOpen={selectedTransaction !== null}
          onClose={() => setSelectedTransaction(null)}
          onSave={async () => {
            setSelectedTransaction(null)
            await loadFees()
          }}
        />
      )}
    </div>
  )
}
