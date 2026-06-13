import currency from 'currency.js'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import { basisUrl } from '@/lib/financeRouteBuilder'
import { formatCurrency } from '@/lib/formatCurrency'
import type {
  PartnershipBasisFacts,
  PartnershipBasisInterestFacts,
  PartnershipBasisReconciliationFacts,
  PartnershipBasisYearSummaryFact,
} from '@/types/generated/tax-preview-facts'

import {
  humanizeBasisLabel,
  reconciliationStatusBadge,
  statusBadge,
} from '../partnershipBasisDisplay'
import type { FormRenderProps } from './formRegistry'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Year-column header badge for locked / stale / needs-review states. */
function yearColumnBadge(year: PartnershipBasisYearSummaryFact): React.ReactElement | null {
  if (year.isStale) {
    return <Badge variant="destructive" className="ml-1 text-xs">Stale</Badge>
  }
  if (year.isLocked) {
    return <Badge className="ml-1 bg-emerald-600 text-xs hover:bg-emerald-600">Locked</Badge>
  }
  if (year.reviewStatus !== 'reviewed' && year.reviewStatus !== 'locked') {
    return <Badge variant="outline" className="ml-1 text-xs">Review</Badge>
  }
  return null
}

// ---------------------------------------------------------------------------
// Basis walk table rows definition
// ---------------------------------------------------------------------------

interface BasisWalkRow {
  label: string
  isSubtotal?: boolean
  getValue: (wks: PartnershipBasisYearSummaryFact['worksheet']) => number
}

const BASIS_WALK_ROWS: BasisWalkRow[] = [
  { label: 'Beginning basis', getValue: (w) => w.beginningOutsideBasis },
  { label: 'Capital contributions', getValue: (w) => w.capitalContributions },
  {
    label: 'Income increases',
    getValue: (w) => currency(w.taxableIncomeIncrease).add(w.taxExemptIncomeIncrease).value,
  },
  { label: 'Liability increase', getValue: (w) => w.liabilityIncrease },
  {
    label: 'Total increases',
    isSubtotal: true,
    getValue: (w) =>
      currency(w.capitalContributions)
        .add(w.taxableIncomeIncrease)
        .add(w.taxExemptIncomeIncrease)
        .add(w.liabilityIncrease).value,
  },
  {
    label: 'Distributions',
    getValue: (w) => currency(w.cashDistributions).add(w.propertyDistributionsBasis).value,
  },
  { label: 'Losses & deductions', getValue: (w) => w.deductionsLossesDecrease },
  { label: 'Liability decrease', getValue: (w) => w.liabilityDecrease },
  {
    label: 'Nondeductible & foreign taxes',
    getValue: (w) => currency(w.nondeductibleExpensesDecrease).add(w.foreignTaxesDecrease).value,
  },
  {
    label: 'Total decreases',
    isSubtotal: true,
    getValue: (w) =>
      currency(w.cashDistributions)
        .add(w.propertyDistributionsBasis)
        .add(w.deductionsLossesDecrease)
        .add(w.liabilityDecrease)
        .add(w.nondeductibleExpensesDecrease)
        .add(w.foreignTaxesDecrease).value,
  },
  { label: 'Ending basis', isSubtotal: true, getValue: (w) => w.endingOutsideBasis },
  { label: 'Distribution gain', getValue: (w) => w.distributionGain },
  { label: 'Suspended loss carryforward', getValue: (w) => w.suspendedLossCarryforward },
]

// ---------------------------------------------------------------------------
// Basis walk table per-interest
// ---------------------------------------------------------------------------

interface BasisWalkTableProps {
  interest: PartnershipBasisInterestFacts
}

function BasisWalkTable({ interest }: BasisWalkTableProps): React.ReactElement {
  // Build year columns: use basisHistory if available (≥1 entry), else synthesise
  // a single column from the interest's own worksheet so the table always renders.
  const columns: PartnershipBasisYearSummaryFact[] =
    interest.basisHistory.length > 0
      ? [...interest.basisHistory].sort((a, b) => a.taxYear - b.taxYear)
      : [
          {
            taxYear: interest.taxYear,
            reviewStatus: interest.reviewStatus,
            isStale: interest.isStale,
            isLocked: interest.reviewStatus === 'locked',
            carryoverMismatch: interest.carryoverMismatch,
            worksheet: interest.worksheet,
          },
        ]

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[200px] text-xs">Row</TableHead>
            {columns.map((col) => (
              <TableHead key={col.taxYear} className="whitespace-nowrap text-right text-xs">
                {col.taxYear}
                {yearColumnBadge(col)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {BASIS_WALK_ROWS.map((row) => (
            <TableRow
              key={row.label}
              className={row.isSubtotal ? 'bg-muted/40 font-semibold' : ''}
            >
              <TableCell className={`text-xs ${row.isSubtotal ? 'font-semibold' : 'text-muted-foreground'}`}>
                {row.label}
              </TableCell>
              {columns.map((col) => {
                const value = row.getValue(col.worksheet)
                // Highlight the Beginning basis cell when there is a carryover mismatch
                const isMismatchCell = row.label === 'Beginning basis' && col.carryoverMismatch !== null
                return (
                  <TableCell
                    key={col.taxYear}
                    className={`text-right font-mono text-xs ${isMismatchCell ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`}
                    title={
                      isMismatchCell
                        ? `Prior-year ending basis does not equal this year's beginning basis — recompute or review the basis record. Delta: ${formatCurrency(col.carryoverMismatch!)}`
                        : undefined
                    }
                  >
                    {isMismatchCell ? (
                      <span className="flex items-center justify-end gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" aria-hidden="true" />
                        <span className="text-amber-700 dark:text-amber-400">{formatCurrency(value)}</span>
                      </span>
                    ) : (
                      formatCurrency(value)
                    )}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* Mismatch detail rows – rendered once per year that has a mismatch */}
      {columns
        .filter((col) => col.carryoverMismatch !== null)
        .map((col) => (
          <div
            key={`mismatch-${col.taxYear}`}
            className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-300"
            data-testid={`carryover-mismatch-warning-${col.taxYear}`}
          >
            <strong>{col.taxYear}:</strong> Prior-year ending basis does not equal this year&rsquo;s beginning
            basis — recompute or review the basis record. Delta:{' '}
            <span className="font-mono">{formatCurrency(col.carryoverMismatch!)}</span>
          </div>
        ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-interest row (header + walk table + events table)
// ---------------------------------------------------------------------------

interface InterestRowProps {
  interest: PartnershipBasisInterestFacts
}

function PartnershipBasisInterestRow({ interest }: InterestRowProps): React.ReactElement {
  return (
    <div className="rounded-md border border-border bg-card">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{interest.partnershipName}</p>
            {interest.partnershipEin ? (
              <p className="text-xs text-muted-foreground">EIN {interest.partnershipEin}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {interest.hasActionNeeded ? (
              <Badge variant="destructive" className="text-xs" data-testid="action-needed-badge">
                Action needed
              </Badge>
            ) : null}
            {statusBadge(interest.reviewStatus, interest.isStale)}
          </div>
        </div>
      </div>

      {/* Multi-year basis walk */}
      <div className="p-3">
        <BasisWalkTable interest={interest} />
      </div>

      {/* Events table */}
      {interest.events.length > 0 ? (
        <div className="overflow-x-auto border-t border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Event</TableHead>
                <TableHead className="text-xs">Side</TableHead>
                <TableHead className="text-right text-xs">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interest.events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="py-1 text-xs">{humanizeBasisLabel(event.eventType)}</TableCell>
                  <TableCell className="py-1 text-xs text-muted-foreground">
                    {humanizeBasisLabel(event.basisSide)}
                  </TableCell>
                  <TableCell className="py-1 text-right font-mono text-xs">
                    {formatCurrency(event.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reconciliation action cards
// ---------------------------------------------------------------------------

interface ReconciliationSectionProps {
  reconciliations: PartnershipBasisReconciliationFacts[]
  year: number
  onRefresh?: () => Promise<void> | void
}

function ReconciliationSection({ reconciliations, year, onRefresh }: ReconciliationSectionProps): React.ReactElement | null {
  const visible = reconciliations.filter((r) => r.hasReconcilableData)
  if (visible.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">Reconciliation</h3>
      {visible.map((recon) => (
        <ReconciliationCard key={recon.accountId} recon={recon} year={year} {...(onRefresh !== undefined ? { onRefresh } : {})} />
      ))}
    </div>
  )
}

interface ReconciliationCardProps {
  recon: PartnershipBasisReconciliationFacts
  year: number
  onRefresh?: () => Promise<void> | void
}

function ReconciliationCard({ recon, year, onRefresh }: ReconciliationCardProps): React.ReactElement {
  const [isSeeding, setIsSeeding] = useState(false)

  const allCandidates = [...recon.contributionCandidates, ...recon.distributionCandidates]
  const hasLineItemCandidates = allCandidates.some((c) => c.lineItemId !== null)

  const seedFromTransactions = async () => {
    if (
      !window.confirm(
        `Seed ${allCandidates.filter((c) => c.lineItemId !== null).length} contribution/distribution event(s) from account transactions? ` +
          'Each line item will create a reviewed basis event. Re-running is a no-op for already-seeded items.',
      )
    ) {
      return
    }
    setIsSeeding(true)
    try {
      await fetchWrapper.post(
        `/api/finance/accounts/${recon.accountId}/basis/reconciliation/seed?year=${year}`,
        {},
      )
      toast.success('Reconciliation events seeded.')
      if (onRefresh) {
        await onRefresh()
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Seed failed.')
    } finally {
      setIsSeeding(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-4" data-testid={`reconciliation-card-${recon.accountId}`}>
      {/* Card header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Account #{recon.accountId} — {recon.year}</p>
        <div className="flex items-center gap-2">
          <a
            href={basisUrl(recon.accountId, { year: recon.year })}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid={`basis-tab-link-${recon.accountId}`}
          >
            Open Basis tab
          </a>
          {hasLineItemCandidates && onRefresh ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={isSeeding}
              onClick={() => void seedFromTransactions()}
              data-testid={`seed-button-${recon.accountId}`}
            >
              {isSeeding ? <Spinner className="h-3 w-3" /> : null}
              Seed reconciliation events
            </Button>
          ) : null}
        </div>
      </div>

      {/* Flags */}
      {recon.flags.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {recon.flags.map((flag) => (
            <div key={flag.key} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{flag.label}</span>
                {reconciliationStatusBadge(flag.status)}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">Basis</div>
                  <div className="font-mono">{formatCurrency(flag.expected)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Observed</div>
                  <div className="font-mono">{formatCurrency(flag.observed)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Difference</div>
                  <div className="font-mono">{formatCurrency(flag.difference)}</div>
                </div>
              </div>
              {flag.detail ? <p className="mt-1 text-xs text-muted-foreground">{flag.detail}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Candidate cards */}
      {allCandidates.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Candidates</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {allCandidates.map((candidate) => (
              <div
                key={candidate.id}
                className="rounded-md border border-border bg-muted/20 p-3"
                data-testid={`candidate-card-${candidate.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{humanizeBasisLabel(candidate.kind)}</p>
                    {candidate.description ? (
                      <p className="text-xs text-muted-foreground">{candidate.description}</p>
                    ) : null}
                    {candidate.date ? (
                      <p className="text-xs text-muted-foreground">{candidate.date}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-xs font-semibold">{formatCurrency(candidate.amount)}</p>
                    <Badge variant="outline" className="mt-1 text-xs">
                      {humanizeBasisLabel(candidate.reviewStatus)}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Suggested: {humanizeBasisLabel(candidate.suggestedEventType)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel adapter
// ---------------------------------------------------------------------------

interface PartnershipBasisPanelProps {
  facts: PartnershipBasisFacts
  year: number
  onRefresh?: () => Promise<void> | void
}

export function PartnershipBasisPanel({ facts, year, onRefresh }: PartnershipBasisPanelProps): React.ReactElement {
  const totalBeginning = facts.interests
    .reduce((acc, i) => acc.add(i.worksheet.beginningOutsideBasis), currency(0))
    .value
  const totalEnding = facts.interests
    .reduce((acc, i) => acc.add(i.worksheet.endingOutsideBasis), currency(0))
    .value

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Partnership Outside Basis</h2>
        <p className="text-sm text-muted-foreground">
          Read-only summary from the {year} basis rollforward. Use the Account → Basis tab to add events or recompute.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Total beginning basis</div>
          <div className="mt-1 text-lg font-semibold">{formatCurrency(totalBeginning)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Total ending basis</div>
          <div className="mt-1 text-lg font-semibold">{formatCurrency(totalEnding)}</div>
        </div>
      </div>

      <div className="space-y-3">
        {facts.interests.map((interest) => (
          <PartnershipBasisInterestRow key={interest.interestId} interest={interest} />
        ))}
      </div>

      {facts.reconciliations.length > 0 ? (
        <ReconciliationSection
          reconciliations={facts.reconciliations}
          year={year}
          {...(onRefresh !== undefined ? { onRefresh } : {})}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Registry adapter wrapper — receives FormRenderProps and delegates
// ---------------------------------------------------------------------------

export function PartnershipBasisAdapter({ state }: FormRenderProps): React.ReactElement {
  const facts = state.taxFacts?.partnershipBasis

  if (!facts || facts.interests.length === 0) {
    // Skeleton / stub is handled in registry.tsx before reaching here,
    // but guard defensively in case the panel is used standalone.
    return (
      <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/30 p-4">
        <h2 className="text-sm font-semibold text-foreground">Partnership Outside Basis</h2>
        <p className="text-xs text-muted-foreground">
          No partnership basis interests found for this year. Initialize a basis record from the Account → Basis tab to populate this panel.
        </p>
      </div>
    )
  }

  return (
    <PartnershipBasisPanel
      facts={facts}
      year={state.year}
      onRefresh={state.refreshAll}
    />
  )
}
