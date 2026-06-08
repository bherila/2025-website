'use client'

import { AlertTriangle, CheckCircle2, Lock, RefreshCw } from 'lucide-react'
import { type ReactElement,useCallback, useEffect, useMemo, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import { currentTaxYear } from '@/lib/finance/feeTypes'
import { getEffectiveYear, YEAR_CHANGED_EVENT, type YearSelection } from '@/lib/financeRouteBuilder'
import { formatCurrency } from '@/lib/formatCurrency'

interface PartnershipBasisEvent {
  id: number
  eventType: string
  basisSide: string
  amount: number
  sourceType: string
  sourceLabel: string | null
  taxDocumentId: number | null
  taxDocumentAccountId: number | null
  reviewStatus: string
}

interface PartnershipBasisInterest {
  id: number
  partnershipName: string
  partnershipEin: string | null
  beginningOutsideBasis: number
  endingOutsideBasis: number
  beginningTaxBasisCapital: number
  endingTaxBasisCapital: number
  beginningBookCapital: number
  endingBookCapital: number
  insideBasisConfidence: string
  capitalContributions: number
  taxableIncomeIncrease: number
  taxExemptIncomeIncrease: number
  liabilityIncrease: number
  cashDistributions: number
  propertyDistributionsBasis: number
  liabilityDecrease: number
  deductionsLossesDecrease: number
  nondeductibleExpensesDecrease: number
  foreignTaxesDecrease: number
  distributionGain: number
  suspendedLossCarryforward: number
  liquidationGainLoss: number | null
  reviewStatus: string
  isStale: boolean
  events: PartnershipBasisEvent[]
}

interface PartnershipBasisData {
  year: number
  account: { id: number; name: string }
  interests: PartnershipBasisInterest[]
}

interface PartnershipBasisTabProps {
  accountId: number
}

function selectedYearForAccount(accountId: number): number {
  const year = getEffectiveYear(accountId)
  return year === 'all' ? currentTaxYear() : year
}

function statusBadge(status: string, isStale: boolean): ReactElement {
  if (isStale) {
    return <Badge variant="destructive">Stale</Badge>
  }

  if (status === 'reviewed' || status === 'locked') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">{status === 'locked' ? 'Locked' : 'Reviewed'}</Badge>
  }

  if (status === 'estimated') {
    return <Badge variant="secondary">Estimated</Badge>
  }

  return <Badge variant="outline">Needs review</Badge>
}

function metric(label: string, value: number | null): ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value === null ? '—' : formatCurrency(value)}</div>
    </div>
  )
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function PartnershipBasisTab({ accountId }: PartnershipBasisTabProps): ReactElement {
  const [year, setYear] = useState<number>(() => selectedYearForAccount(accountId))
  const [data, setData] = useState<PartnershipBasisData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = (await fetchWrapper.get(`/api/finance/accounts/${accountId}/basis?year=${year}`)) as PartnershipBasisData
      setData(response)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load partnership basis data')
    } finally {
      setIsLoading(false)
    }
  }, [accountId, year])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handleYearChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ accountId: number; year: YearSelection }>
      if (customEvent.detail.accountId === accountId) {
        setYear(customEvent.detail.year === 'all' ? currentTaxYear() : customEvent.detail.year)
      }
    }

    window.addEventListener(YEAR_CHANGED_EVENT, handleYearChange)
    return () => window.removeEventListener(YEAR_CHANGED_EVENT, handleYearChange)
  }, [accountId])

  const totals = useMemo(() => {
    const interests = data?.interests ?? []
    return {
      beginningOutsideBasis: interests.reduce((sum, interest) => sum + interest.beginningOutsideBasis, 0),
      endingOutsideBasis: interests.reduce((sum, interest) => sum + interest.endingOutsideBasis, 0),
      distributionGain: interests.reduce((sum, interest) => sum + interest.distributionGain, 0),
      suspendedLossCarryforward: interests.reduce((sum, interest) => sum + interest.suspendedLossCarryforward, 0),
    }
  }, [data])

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner /></div>
  }

  if (error) {
    return <Alert variant="destructive" className="m-4"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Partnership Basis</h1>
          <p className="text-sm text-muted-foreground">Outside basis, tax-basis capital, inside-basis proxy, and source-level review for {year}.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} className="gap-2"><RefreshCw className="h-4 w-4" /> Recompute</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metric('Beginning outside basis', totals.beginningOutsideBasis)}
        {metric('Ending outside basis', totals.endingOutsideBasis)}
        {metric('Distribution gain sources', totals.distributionGain)}
        {metric('Suspended basis-limited losses', totals.suspendedLossCarryforward)}
      </div>

      {(data?.interests.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No partnership basis records were found for this account/year. Link a K-1 or initialize basis from the account basis API.
          </CardContent>
        </Card>
      ) : data?.interests.map((interest) => (
        <Card key={interest.id}>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>{interest.partnershipName}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Inside-basis confidence: {humanize(interest.insideBasisConfidence)}</p>
              </div>
              <div className="flex items-center gap-2">
                {interest.reviewStatus === 'locked' && <Lock className="h-4 w-4 text-muted-foreground" />}
                {statusBadge(interest.reviewStatus, interest.isStale)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {metric('Tax-basis capital ending', interest.endingTaxBasisCapital)}
              {metric('Book/FMV capital ending', interest.endingBookCapital)}
              {metric('Income increases', interest.taxableIncomeIncrease + interest.taxExemptIncomeIncrease)}
              {metric('Distributions', interest.cashDistributions + interest.propertyDistributionsBasis)}
              {metric('Liability increases', interest.liabilityIncrease)}
              {metric('Liability decreases', interest.liabilityDecrease)}
              {metric('Liquidation gain/loss', interest.liquidationGainLoss)}
              {metric('Ending outside basis', interest.endingOutsideBasis)}
            </div>

            {(interest.distributionGain > 0 || interest.suspendedLossCarryforward > 0 || interest.isStale) && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Review required: excess distributions, suspended losses, or stale downstream rollforward is present.
                </AlertDescription>
              </Alert>
            )}

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interest.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div className="font-medium">{event.sourceLabel ?? humanize(event.sourceType)}</div>
                        <div className="text-xs text-muted-foreground">
                          {event.taxDocumentId ? `tax document #${event.taxDocumentId}` : event.sourceType}
                          {event.taxDocumentAccountId ? ` · link #${event.taxDocumentAccountId}` : ''}
                        </div>
                      </TableCell>
                      <TableCell>{humanize(event.eventType)}</TableCell>
                      <TableCell>{humanize(event.basisSide)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(event.amount)}</TableCell>
                      <TableCell>{event.reviewStatus === 'reviewed' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Badge variant="outline">Needs review</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
