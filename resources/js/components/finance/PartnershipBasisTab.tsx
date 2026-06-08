'use client'

import currency from 'currency.js'
import { AlertTriangle, CheckCircle2, Lock, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react'

import { DetailsButton, InfoTooltip, type NavGlyph } from '@/components/finance/tax-preview-primitives'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import { currentTaxYear } from '@/lib/finance/feeTypes'
import { getEffectiveYear, transactionsUrl, YEAR_CHANGED_EVENT, type YearSelection } from '@/lib/financeRouteBuilder'
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
  accountId: number | null
  lineItemId: number | null
  statementId: number | null
  k1Box: string | null
  k1Code: string | null
  reviewStatus: string
}

interface PartnershipBasisInterest {
  id: number
  interestId: number
  partnershipName: string
  partnershipEin: string | null
  interestStartDate: string | null
  interestEndDate: string | null
  isPtp: boolean
  holdingPeriod: string
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

interface ReconciliationFlag {
  key: string
  label: string
  status: string
  expected: number
  observed: number
  difference: number
  detail: string
}

interface ReconciliationItem {
  id: string
  kind: string
  date: string | null
  description: string | null
  amount: number
  suggestedEventType: string
  lineItemId: number | null
  statementId: number | null
  reviewStatus: string
}

interface ReconciliationData {
  accountId: number
  year: number
  contributionCandidates: ReconciliationItem[]
  distributionCandidates: ReconciliationItem[]
  flags: ReconciliationFlag[]
  hasReconcilableData: boolean
}

interface PartnershipBasisData {
  year: number
  account: { id: number; name: string }
  interests: PartnershipBasisInterest[]
  reconciliation: ReconciliationData
}

interface PartnershipBasisTabProps {
  accountId: number
}

/** Manual event types a user can record from the UI (validated server-side against the enum). */
const MANUAL_EVENT_TYPES: { value: string; label: string }[] = [
  { value: 'capital_contribution_cash', label: 'Capital contribution (cash)' },
  { value: 'capital_contribution_property_basis', label: 'Capital contribution (property basis)' },
  { value: 'taxable_income', label: 'Taxable income allocation' },
  { value: 'tax_exempt_income', label: 'Tax-exempt income' },
  { value: 'cash_distribution', label: 'Cash distribution' },
  { value: 'property_distribution_basis', label: 'Property distribution (adjusted basis)' },
  { value: 'liability_increase', label: 'Liability share increase' },
  { value: 'liability_decrease', label: 'Liability share decrease' },
  { value: 'deductible_loss', label: 'Deductible loss' },
  { value: 'nondeductible_expense', label: 'Nondeductible expense' },
  { value: 'foreign_tax', label: 'Foreign tax' },
  { value: 'beginning_basis', label: 'Beginning basis override' },
  { value: 'manual_increase_to_outside_basis', label: 'Manual basis increase' },
  { value: 'manual_decrease_to_outside_basis', label: 'Manual basis decrease' },
  { value: 'manual_reconciliation_note', label: 'Memorandum note (no basis effect)' },
]

function selectedYearForAccount(accountId: number): number {
  const year = getEffectiveYear(accountId)
  return year === 'all' ? currentTaxYear() : year
}

function dollarsToCents(value: string): number {
  return currency(value || 0).intValue
}

function statusBadge(status: string, isStale: boolean): ReactElement {
  if (isStale) {
    return <Badge variant="destructive">Stale</Badge>
  }
  if (status === 'locked') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Locked</Badge>
  }
  if (status === 'reviewed') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Reviewed</Badge>
  }
  if (status === 'estimated') {
    return <Badge variant="secondary">Estimated</Badge>
  }
  return <Badge variant="outline">Needs review</Badge>
}

function metric(label: string, value: number | null, info?: string): ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        {info ? <InfoTooltip>{info}</InfoTooltip> : null}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value === null ? '—' : formatCurrency(value)}</div>
    </div>
  )
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/** Holding period of the interest, used to characterise §731 gain on the deemed sale of the interest. */
function holdingPeriodBadge(holdingPeriod: string): ReactElement {
  if (holdingPeriod === 'long') {
    return <Badge variant="secondary">Long-term holding</Badge>
  }
  if (holdingPeriod === 'short') {
    return <Badge variant="secondary">Short-term holding</Badge>
  }
  return <Badge variant="outline">Holding period: set acquisition date</Badge>
}

/** Badge for a reconciliation comparison: green when matched, amber for mismatch, neutral for info. */
function reconciliationStatusBadge(status: string): ReactElement {
  if (status === 'match') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Match</Badge>
  }
  if (status === 'mismatch') {
    return <Badge variant="destructive">Mismatch</Badge>
  }
  return <Badge variant="outline">Info</Badge>
}

/** Where an event originated, for the amber "Go to source" drill button. */
function sourceNav(event: PartnershipBasisEvent, accountId: number, year: number): { label: string; glyph: NavGlyph; href: string } | null {
  if (event.taxDocumentId !== null) {
    const box = event.k1Box ? ` (Box ${event.k1Box}${event.k1Code ?? ''})` : ''
    return { label: `Go to source: K-1 document #${event.taxDocumentId}${box}`, glyph: 'window', href: `/finance/tax-preview?year=${year}` }
  }
  if (event.sourceType === 'account_transaction' || event.lineItemId !== null) {
    return { label: 'Go to source: account transactions', glyph: 'window', href: transactionsUrl(accountId, { year }) }
  }
  if (event.sourceType === 'statement' || event.statementId !== null) {
    return { label: 'Go to source: statement', glyph: 'window', href: transactionsUrl(accountId, { year }) }
  }
  return null
}

export default function PartnershipBasisTab({ accountId }: PartnershipBasisTabProps): ReactElement {
  const [year, setYear] = useState<number>(() => selectedYearForAccount(accountId))
  const [data, setData] = useState<PartnershipBasisData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
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

  // Reads never mutate basis state, so recompute is an explicit POST that re-syncs from K-1s.
  const runMutation = useCallback(async (mutate: () => Promise<unknown>) => {
    setIsBusy(true)
    setError(null)
    try {
      await mutate()
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The basis action could not be completed.')
    } finally {
      setIsBusy(false)
    }
  }, [load])

  const recompute = useCallback(() => {
    void runMutation(() => fetchWrapper.post(`/api/finance/accounts/${accountId}/basis/recompute?year=${year}`, {}))
  }, [runMutation, accountId, year])

  const lockYear = useCallback(() => {
    if (!window.confirm(`Lock ${year}? Locked years reject new events until unlocked.`)) {
      return
    }
    void runMutation(() => fetchWrapper.post(`/api/finance/accounts/${accountId}/basis/lock?year=${year}`, {}))
  }, [runMutation, accountId, year])

  const totals = useMemo(() => {
    const interests = data?.interests ?? []
    const sum = (pick: (interest: PartnershipBasisInterest) => number): number =>
      interests.reduce((acc, interest) => acc.add(pick(interest)), currency(0)).value
    return {
      beginningOutsideBasis: sum((i) => i.beginningOutsideBasis),
      endingOutsideBasis: sum((i) => i.endingOutsideBasis),
      distributionGain: sum((i) => i.distributionGain),
      suspendedLossCarryforward: sum((i) => i.suspendedLossCarryforward),
    }
  }, [data])

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner /></div>
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Partnership Basis</h1>
          <p className="text-sm text-muted-foreground">Outside basis, tax-basis capital, inside-basis proxy, and source-level review for {year}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InitializeBasisDialog accountId={accountId} year={year} disabled={isBusy} onSaved={load} setError={setError} />
          <Button variant="outline" onClick={recompute} disabled={isBusy} className="gap-2"><RefreshCw className="h-4 w-4" /> Recompute</Button>
          <Button
            variant="outline"
            className="h-9 gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-700/70 dark:text-amber-300 dark:hover:bg-amber-950/40"
            onClick={() => { window.location.href = `/finance/tax-preview?year=${year}` }}
          >
            Go to Tax Preview
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metric('Beginning outside basis', totals.beginningOutsideBasis, 'Your adjusted tax basis in the interest at the start of the year. Limits deductible losses and gain on excess distributions; rolls forward each year.')}
        {metric('Ending outside basis', totals.endingOutsideBasis, 'Outside basis after the year’s contributions, income, distributions, and losses, floored at zero.')}
        {metric('Distribution gain sources', totals.distributionGain, 'Cash distributions in excess of outside basis are treated as gain from the sale of the interest and feed Schedule D as reviewable rows.')}
        {metric('Suspended basis-limited losses', totals.suspendedLossCarryforward, 'Losses and deductions limited by basis; carried forward until basis is restored.')}
      </div>

      {(data?.interests.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No partnership basis records were found for this account/year. Use <strong>Initialize basis</strong> to seed an opening
            position, or link a K-1 to this account and press <strong>Recompute</strong>.
          </CardContent>
        </Card>
      ) : data?.interests.map((interest) => (
        <Card key={interest.id}>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-1">
                  {interest.partnershipName}
                  <InfoTooltip>True inside basis is partnership-level asset basis and usually cannot be derived from a K-1 alone; the figure shown is a reported/estimated proxy.</InfoTooltip>
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {interest.partnershipEin ? `EIN ${interest.partnershipEin} · ` : ''}Inside-basis confidence: {humanize(interest.insideBasisConfidence)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {holdingPeriodBadge(interest.holdingPeriod)}
                  <span className="text-xs text-muted-foreground">
                    Acquired: {interest.interestStartDate ?? '—'}
                    {interest.interestEndDate ? ` · Disposed: ${interest.interestEndDate}` : ''}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {interest.reviewStatus === 'locked' && <Lock className="h-4 w-4 text-muted-foreground" />}
                {statusBadge(interest.reviewStatus, interest.isStale)}
                <EditInterestDialog accountId={accountId} interest={interest} disabled={isBusy} onSaved={load} setError={setError} />
                <AddEventDialog accountId={accountId} year={year} interestId={interest.interestId} disabled={isBusy} onSaved={load} setError={setError} />
                <DetailsButton
                  glyph="window"
                  tooltip="Go to destination: Tax Preview (Schedule D & basis worksheet)"
                  onClick={() => { window.location.href = `/finance/tax-preview?year=${year}` }}
                />
                {interest.reviewStatus !== 'locked' && (
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={isBusy} onClick={lockYear}>
                    <Lock className="h-3 w-3" /> Lock {year}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {metric('Tax-basis capital ending', interest.endingTaxBasisCapital, 'Capital account reported on the K-1 under tax-basis reporting. Related to, but not always equal to, outside basis.')}
              {metric('Book/FMV capital ending', interest.endingBookCapital, 'Accounting / NAV capital. Reconciliation only — never used as outside basis.')}
              {metric('Income increases', currency(interest.taxableIncomeIncrease).add(interest.taxExemptIncomeIncrease).value, 'Distributive-share taxable income plus tax-exempt income; both increase basis whether or not cash was distributed.')}
              {metric('Distributions', currency(interest.cashDistributions).add(interest.propertyDistributionsBasis).value, 'Cash and property distributions reduce basis. Cash in excess of basis triggers gain; property reallocates basis without gain.')}
              {metric('Liability increases', interest.liabilityIncrease, 'Increases in your share of partnership liabilities are treated as deemed contributions and increase basis.')}
              {metric('Liability decreases', interest.liabilityDecrease, 'Decreases in your share of liabilities are deemed cash distributions and reduce basis.')}
              {metric('Liquidation gain/loss', interest.liquidationGainLoss, 'Estimate only — the true result depends on the character of property received. Always review before reporting.')}
              {metric('Ending outside basis', interest.endingOutsideBasis, 'Adjusted tax basis carried into next year.')}
            </div>

            {(interest.distributionGain > 0 || interest.suspendedLossCarryforward > 0 || interest.isStale) && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {interest.isStale
                    ? 'A prior year changed after this year was computed. Press Recompute to refresh the rollforward.'
                    : 'Review required: excess distributions and/or suspended losses are present. §754 step-up amortization detail is not tracked and is flagged for review.'}
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
                    <TableHead className="w-10 text-right">Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interest.events.map((event) => {
                    const nav = sourceNav(event, accountId, year)
                    return (
                      <TableRow key={event.id}>
                        <TableCell>
                          <div className="font-medium">{event.sourceLabel ?? humanize(event.sourceType)}</div>
                          <div className="text-xs text-muted-foreground">
                            {event.taxDocumentId ? `K-1 document #${event.taxDocumentId}` : humanize(event.sourceType)}
                            {event.taxDocumentAccountId ? ` · link #${event.taxDocumentAccountId}` : ''}
                          </div>
                        </TableCell>
                        <TableCell>{humanize(event.eventType)}</TableCell>
                        <TableCell>{humanize(event.basisSide)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(event.amount)}</TableCell>
                        <TableCell>{event.reviewStatus === 'reviewed' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Badge variant="outline">Needs review</Badge>}</TableCell>
                        <TableCell className="text-right">
                          {nav ? <DetailsButton glyph={nav.glyph} tooltip={nav.label} onClick={() => { window.location.href = nav.href }} /> : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      {data?.reconciliation?.hasReconcilableData ? (
        <ReconciliationCard reconciliation={data.reconciliation} />
      ) : null}
    </div>
  )
}

function ReconciliationCard({ reconciliation }: { reconciliation: ReconciliationData }): ReactElement {
  const candidates = [...reconciliation.contributionCandidates, ...reconciliation.distributionCandidates]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          Transaction &amp; statement reconciliation
          <InfoTooltip>Read-only candidates and comparisons from this account&rsquo;s transactions and statements. Nothing here changes outside basis until you review it and add an event.</InfoTooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {reconciliation.flags.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {reconciliation.flags.map((flag) => (
              <div key={flag.key} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{flag.label}</span>
                  {reconciliationStatusBadge(flag.status)}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div><div className="text-xs text-muted-foreground">Basis</div><div className="font-mono">{formatCurrency(flag.expected)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Observed</div><div className="font-mono">{formatCurrency(flag.observed)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Difference</div><div className="font-mono">{formatCurrency(flag.difference)}</div></div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{flag.detail}</p>
              </div>
            ))}
          </div>
        )}

        {candidates.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Suggested event</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell className="whitespace-nowrap">{candidate.date ?? '—'}</TableCell>
                    <TableCell>
                      <div className="font-medium">{humanize(candidate.kind)}</div>
                      <div className="text-xs text-muted-foreground">{candidate.description ?? '—'}</div>
                    </TableCell>
                    <TableCell>{humanize(candidate.suggestedEventType)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(candidate.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface BasisActionDialogProps {
  accountId: number
  year: number
  disabled: boolean
  onSaved: () => Promise<void> | void
  setError: (message: string | null) => void
}

function InitializeBasisDialog({ accountId, year, disabled, onSaved, setError }: BasisActionDialogProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ partnershipName: '', cash: '', taxCapital: '', bookCapital: '', outsideBasisOverride: '', startDate: '', notes: '' })

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await fetchWrapper.post(`/api/finance/accounts/${accountId}/basis/initialization`, {
        tax_year: year,
        partnership_name: form.partnershipName || null,
        initial_cash_contribution_cents: form.cash ? dollarsToCents(form.cash) : null,
        initial_tax_basis_capital_cents: form.taxCapital ? dollarsToCents(form.taxCapital) : null,
        initial_book_capital_or_fmv_cents: form.bookCapital ? dollarsToCents(form.bookCapital) : null,
        initial_outside_basis_override_cents: form.outsideBasisOverride ? dollarsToCents(form.outsideBasisOverride) : null,
        interest_start_date: form.startDate || null,
        initialization_review_status: 'needs_review',
        notes: form.notes || null,
      })
      setOpen(false)
      await onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Initialization failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="outline" className="gap-2" disabled={disabled} onClick={() => setOpen(true)}><Settings2 className="h-4 w-4" /> Initialize basis</Button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Initialize partnership basis for {year}</DialogTitle>
          <DialogDescription>
            Seed the opening position. The initial cash/property contribution can differ from the capital-account value;
            outside basis is never seeded from book/FMV capital unless you set an explicit override.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="pb-name">Partnership name</Label>
            <Input id="pb-name" value={form.partnershipName} onChange={(e) => setForm({ ...form, partnershipName: e.target.value })} placeholder="Partnership name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CurrencyField id="pb-cash" label="Cash contribution" value={form.cash} onChange={(v) => setForm({ ...form, cash: v })} info="Money contributed for the interest (initial outside basis)." />
            <CurrencyField id="pb-tax-capital" label="Tax-basis capital" value={form.taxCapital} onChange={(v) => setForm({ ...form, taxCapital: v })} info="Beginning tax-basis capital reported on the K-1." />
            <CurrencyField id="pb-book-capital" label="Book / FMV capital" value={form.bookCapital} onChange={(v) => setForm({ ...form, bookCapital: v })} info="Capital-account / NAV value. Reconciliation only." />
            <CurrencyField id="pb-override" label="Outside basis override" value={form.outsideBasisOverride} onChange={(v) => setForm({ ...form, outsideBasisOverride: v })} info="Optional. Sets opening outside basis directly when known." />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pb-start" className="flex items-center gap-1">
              Acquisition date
              <InfoTooltip>When the interest was acquired. Sets the holding period for §731 gain on excess distributions and on the sale/liquidation of the interest.</InfoTooltip>
            </Label>
            <Input id="pb-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pb-notes">Notes</Label>
            <Input id="pb-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={saving}>{saving ? 'Saving…' : 'Initialize'}</Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  )
}

function AddEventDialog({ accountId, year, interestId, disabled, onSaved, setError }: BasisActionDialogProps & { interestId: number }): ReactElement {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ eventType: 'cash_distribution', amount: '', eventDate: '', sourceLabel: '', notes: '' })

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await fetchWrapper.post(`/api/finance/accounts/${accountId}/basis/events`, {
        tax_year: year,
        partnership_interest_id: interestId,
        event_type: form.eventType,
        amount_cents: dollarsToCents(form.amount),
        event_date: form.eventDate || null,
        source_label: form.sourceLabel || null,
        notes: form.notes || null,
        review_status: 'needs_review',
      })
      setOpen(false)
      await onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add the event.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={disabled} onClick={() => setOpen(true)}><Plus className="h-3 w-3" /> Add event</Button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add manual basis event ({year})</DialogTitle>
          <DialogDescription>Record a contribution, distribution, income, or adjustment. Income and distributions are tracked separately.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Event type</Label>
            <Select value={form.eventType} onValueChange={(v) => setForm({ ...form, eventType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MANUAL_EVENT_TYPES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CurrencyField id="ae-amount" label="Amount" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} info="Enter the gross amount; the rollforward applies the correct sign for the chosen type." />
            <div className="space-y-1">
              <Label htmlFor="ae-date">Event date</Label>
              <Input id="ae-date" type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ae-label">Source label</Label>
            <Input id="ae-label" value={form.sourceLabel} onChange={(e) => setForm({ ...form, sourceLabel: e.target.value })} placeholder="e.g. Q3 capital call" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ae-notes">Notes</Label>
            <Input id="ae-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={saving || !form.amount}>{saving ? 'Saving…' : 'Add event'}</Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  )
}

function EditInterestDialog({ accountId, interest, disabled, onSaved, setError }: { accountId: number; interest: PartnershipBasisInterest; disabled: boolean; onSaved: () => Promise<void> | void; setError: (message: string | null) => void }): ReactElement {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    startDate: interest.interestStartDate ?? '',
    endDate: interest.interestEndDate ?? '',
    isPtp: interest.isPtp,
  })

  // Reset to the interest's current values each time the dialog opens (after a reload changes props).
  const openDialog = () => {
    setForm({ startDate: interest.interestStartDate ?? '', endDate: interest.interestEndDate ?? '', isPtp: interest.isPtp })
    setOpen(true)
  }

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await fetchWrapper.put(`/api/finance/accounts/${accountId}/basis/interests/${interest.interestId}`, {
        interest_start_date: form.startDate || null,
        interest_end_date: form.endDate || null,
        is_ptp: form.isPtp,
      })
      setOpen(false)
      await onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the interest.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={disabled} onClick={openDialog}><Settings2 className="h-3 w-3" /> Interest</Button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Interest details — {interest.partnershipName}</DialogTitle>
          <DialogDescription>
            The acquisition date sets the holding period used to characterise §731 gain on excess distributions and the sale/liquidation of the interest (long-term when held more than one year).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ei-start">Acquisition date</Label>
              <Input id="ei-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ei-end">Disposition date</Label>
              <Input id="ei-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={form.isPtp} onChange={(e) => setForm({ ...form, isPtp: e.target.checked })} />
            Publicly traded partnership (PTP)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  )
}

function CurrencyField({ id, label, value, onChange, info }: { id: string; label: string; value: string; onChange: (value: string) => void; info?: string }): ReactElement {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="flex items-center gap-1">
        {label}
        {info ? <InfoTooltip>{info}</InfoTooltip> : null}
      </Label>
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.00" />
    </div>
  )
}
