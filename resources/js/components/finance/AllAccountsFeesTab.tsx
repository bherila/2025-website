'use client'

import currency from 'currency.js'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { FeeDragLineChart } from '@/components/finance/FeesTab'
import ReconciliationTile from '@/components/finance/ReconciliationTile'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import {
  type AccountFeeSummary,
  currentTaxYear,
  type FeeBreakdown,
  type MonthlyFeeDragPoint,
  type ReconciliationSummary,
  statusClassName,
  statusLabel,
} from '@/lib/finance/feeTypes'
import { formatCurrency } from '@/lib/formatCurrency'
import { cn } from '@/lib/utils'

interface AllAccountsFeesData {
  year: number
  totals: {
    total: number
    by_characteristic: FeeBreakdown
  }
  accounts: AccountFeeSummary[]
  monthly_fee_drag: MonthlyFeeDragPoint[]
  reconciliation_summary: ReconciliationSummary
}

function initialTaxYear(): number {
  if (typeof window === 'undefined') return currentTaxYear()

  const queryYear = Number(new URLSearchParams(window.location.search).get('year'))
  if (Number.isInteger(queryYear) && queryYear >= 1900 && queryYear <= 2100) return queryYear

  return currentTaxYear()
}

export default function AllAccountsFeesTab() {
  const [year, setYear] = useState(initialTaxYear)
  const [yearInput, setYearInput] = useState(() => String(initialTaxYear()))
  const [data, setData] = useState<AllAccountsFeesData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadFees = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchWrapper.get(`/api/finance/all/fees?year=${year}`) as AllAccountsFeesData
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [year])

  useEffect(() => {
    loadFees()
  }, [loadFees])

  const applyYear = () => {
    const parsedYear = Number(yearInput)
    if (Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100) {
      setYear(parsedYear)
    } else {
      setYearInput(String(year))
    }
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

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          applyYear()
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="allAccountsFeeYear">Tax year</Label>
          <Input
            id="allAccountsFeeYear"
            className="w-28"
            inputMode="numeric"
            min={1900}
            max={2100}
            type="number"
            value={yearInput}
            onChange={(event) => setYearInput(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={isLoading}>
          Apply
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Fees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatCurrency(data.totals.total)}</div>
            <div className="text-sm text-muted-foreground">{data.year}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Schedule E</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(data.totals.by_characteristic.fee_schE)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Personal</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(data.totals.by_characteristic.fee_irc67g)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Untagged</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(data.totals.by_characteristic.untagged)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per-Account Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-end">Balance</TableHead>
                <TableHead className="text-end">Expected</TableHead>
                <TableHead className="text-end">Actual</TableHead>
                <TableHead className="text-end">Delta</TableHead>
                <TableHead className="text-end">% of Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.accounts.map((account) => (
                <TableRow key={account.acct_id}>
                  <TableCell>
                    <a className="font-medium text-primary underline-offset-4 hover:underline" href={account.fees_url}>
                      {account.acct_name}
                    </a>
                  </TableCell>
                  <TableCell className="text-end">{formatCurrency(account.balance)}</TableCell>
                  <TableCell className="text-end">{account.has_expectation ? formatCurrency(account.expected_fees) : '-'}</TableCell>
                  <TableCell className="text-end">{formatCurrency(account.actual_fees)}</TableCell>
                  <TableCell className="text-end">{account.has_expectation ? formatCurrency(currency(account.actual_fees).subtract(account.expected_fees).value) : '-'}</TableCell>
                  <TableCell className="text-end">{account.pct_of_balance === null ? '-' : `${account.pct_of_balance.toFixed(2)}%`}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('rounded-md', statusClassName(account.status))}>
                      {statusLabel(account.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aggregate Fee Drag</CardTitle>
        </CardHeader>
        <CardContent>
          <FeeDragLineChart series={data.monthly_fee_drag} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reconciliation Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <ReconciliationTile
            href="/finance/account/all/fees"
            label="Matched"
            count={data.reconciliation_summary.matched}
            icon={CheckCircle2}
            iconClassName="h-4 w-4 text-emerald-600"
          />
          <ReconciliationTile
            href="/finance/account/all/fees"
            label="Mismatched"
            count={data.reconciliation_summary.mismatched}
            icon={AlertTriangle}
            iconClassName="h-4 w-4 text-red-600"
          />
          <ReconciliationTile
            href="/finance/account/all/fees"
            label="Unclassified"
            count={data.reconciliation_summary.unclassified}
            icon={AlertTriangle}
            iconClassName="h-4 w-4 text-amber-600"
          />
          <ReconciliationTile
            href="/finance/documents"
            label="Unlinked K-1s"
            count={data.reconciliation_summary.unlinked}
          />
        </CardContent>
      </Card>
    </div>
  )
}
