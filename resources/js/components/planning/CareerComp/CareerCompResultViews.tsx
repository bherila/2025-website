import { type ReactElement, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import type { CareerCompLiquidityMode, CareerCompLtvBand, CareerCompLtvMetric } from './careerCompRoute'
import { AnnualFreeCashFlowChart } from './charts/AnnualFreeCashFlowChart'
import { type LiquidityMode, LiquidityOverTimeChart } from './charts/LiquidityOverTimeChart'
import { PaperLifetimeValueChart } from './charts/PaperLifetimeValueChart'
import { formatFriendlyMoney, formatMoney, formatShares, formatSignedFriendlyMoney, formatSignedMoney } from './formatters'
import { BAND_LABELS, type LifetimeValueRow, mapAfterTaxAnnualFreeCashFlowRows, mapAfterTaxLifetimeValueRows, mapAfterTaxSourceBreakdownRows, mapLifetimeValueRows, type ProjectionBand } from './mappers'
import type { CareerCompProjection } from './types'

interface ProjectionProps {
  projection: CareerCompProjection
}

interface ProjectionLiquidityProps extends ProjectionProps {
  initialMode?: LiquidityMode | undefined
  onOpenDetail?: ((jobId: string, year: number, band: CareerCompLtvBand, mode: CareerCompLiquidityMode) => void) | undefined
}

interface ProjectionLifetimeValueProps extends ProjectionProps {
  onOpenDetail?: ((jobId: string, metric: CareerCompLtvMetric, band: CareerCompLtvBand) => void) | undefined
}

const LTV_DRILL_LABELS: Record<CareerCompLtvMetric, string> = {
  'cash-comp': 'cash comp',
  'liquid-equity': 'liquid equity',
  'paper-equity': 'paper equity',
  'liquid-total': 'liquid total',
  'paper-total': 'paper total',
}

export function ProjectionLiquidity({ projection, initialMode = 'preTax', onOpenDetail }: ProjectionLiquidityProps): ReactElement {
  return <LiquidityOverTimeChart projection={projection} initialMode={initialMode} onOpenDetail={onOpenDetail} />
}

export function ProjectionAnnualFreeCashFlow({ projection }: ProjectionProps): ReactElement {
  return <AnnualFreeCashFlowChart projection={projection} />
}

function hasAfterTaxProjection(projection: CareerCompProjection): boolean {
  return projection.jobs.some((job) => job.afterTax !== undefined)
}

function AfterTaxUnavailable(): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>After-tax projection unavailable</CardTitle>
        <CardDescription>Recalculate the scenario to populate the after-tax projection fields.</CardDescription>
      </CardHeader>
    </Card>
  )
}

function sourceTypeLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    equity_comp_iso_bargain_element: 'ISO AMT preference',
    equity_comp_nso_ordinary_income: 'NSO ordinary income',
    equity_comp_rsu_ordinary_income: 'RSU ordinary income',
    equity_comp_83b_election: '83(b) election',
    equity_comp_sale_proceeds: 'Equity sale proceeds',
  }

  return labels[sourceType] ?? sourceType
}

function lifetimeValue(row: LifetimeValueRow, band: ProjectionBand, metric: 'totalEquity' | 'totalPaperEquity' | 'totalValue' | 'totalPaperValue' | 'totalValueDelta' | 'totalPaperValueDelta'): number | null {
  if (metric === 'totalEquity') {
    return band === 'low' ? row.totalEquityLow : band === 'medium' ? row.totalEquityMedium : row.totalEquityHigh
  }

  if (metric === 'totalPaperEquity') {
    return band === 'low' ? row.totalPaperEquityLow : band === 'medium' ? row.totalPaperEquityMedium : row.totalPaperEquityHigh
  }

  if (metric === 'totalValue') {
    return band === 'low' ? row.totalValueLow : band === 'medium' ? row.totalValueMedium : row.totalValueHigh
  }

  if (metric === 'totalPaperValue') {
    return band === 'low' ? row.totalPaperValueLow : band === 'medium' ? row.totalPaperValueMedium : row.totalPaperValueHigh
  }

  if (metric === 'totalValueDelta') {
    return band === 'low' ? row.totalValueDeltaLow : band === 'medium' ? row.totalValueDeltaMedium : row.totalValueDeltaHigh
  }

  return band === 'low' ? row.totalPaperValueDeltaLow : band === 'medium' ? row.totalPaperValueDeltaMedium : row.totalPaperValueDeltaHigh
}

function LtvDrillButton({
  jobId,
  jobName,
  metric,
  band,
  value,
  onOpenDetail,
}: {
  jobId: string
  jobName: string
  metric: CareerCompLtvMetric
  band: ProjectionBand
  value: number | null
  onOpenDetail?: ((jobId: string, metric: CareerCompLtvMetric, band: CareerCompLtvBand) => void) | undefined
}): ReactElement {
  const bandLabel = BAND_LABELS[band].toLowerCase()
  const metricLabel = LTV_DRILL_LABELS[metric]
  const ariaLabel = metric === 'cash-comp'
    ? `Drill into ${jobName} ${metricLabel}`
    : `Drill into ${jobName} ${metricLabel} ${bandLabel}`

  if (!onOpenDetail) {
    return <span className="font-currency tabular-nums">{formatFriendlyMoney(value)}</span>
  }

  return (
    <button
      type="button"
      className="inline-flex min-w-16 justify-end rounded-sm text-right font-currency tabular-nums text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={ariaLabel}
      onClick={() => onOpenDetail(jobId, metric, band)}
    >
      {formatFriendlyMoney(value)}
    </button>
  )
}

function DeltaValue({
  hasCurrentJob,
  offerValue,
  currentValue,
  delta,
}: {
  hasCurrentJob: boolean
  offerValue: number | null
  currentValue: number | null
  delta: number | null
}): ReactElement {
  if (!hasCurrentJob || currentValue === null || offerValue === null) {
    return <span>No current job</span>
  }

  if (delta === null) {
    return <span className="text-muted-foreground" aria-label="Current job baseline">—</span>
  }

  const math = `${formatMoney(offerValue)} − ${formatMoney(currentValue)} = ${formatSignedMoney(delta)}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={math} className="inline-flex justify-end font-currency tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {formatSignedFriendlyMoney(delta)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{math}</TooltipContent>
    </Tooltip>
  )
}

export function ProjectionAfterTaxLiquidity({ projection }: ProjectionProps): ReactElement {
  return <LiquidityOverTimeChart projection={projection} initialMode="afterTax" />
}

export function ProjectionAfterTaxFreeCashFlow({ projection }: ProjectionProps): ReactElement {
  const annualRows = useMemo(() => mapAfterTaxAnnualFreeCashFlowRows(projection), [projection])
  const lifetimeRows = useMemo(() => mapAfterTaxLifetimeValueRows(projection), [projection])
  const sourceRows = useMemo(() => mapAfterTaxSourceBreakdownRows(projection), [projection])
  const hasCurrentJob = projection.currentJobId !== null

  if (!hasAfterTaxProjection(projection)) {
    return <AfterTaxUnavailable />
  }

  return (
    <div className="grid gap-6">
      <AnnualFreeCashFlowChart projection={projection} mode="afterTax" />

      <Card>
        <CardHeader>
          <CardTitle>After-tax lifetime value comparison</CardTitle>
          <CardDescription>Lifetime after-tax totals consume the backend federal and AMT projection. Deltas compare against the current job when one exists.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-lg border" aria-label="After-tax lifetime value comparison table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead className="text-right">Regular tax</TableHead>
                  <TableHead className="text-right">AMT</TableHead>
                  <TableHead className="text-right">Total tax</TableHead>
                  <TableHead className="text-right">After-tax FCF</TableHead>
                  <TableHead className="text-right">After-tax med LTV</TableHead>
                  <TableHead className="text-right">Med LTV Δ</TableHead>
                  <TableHead className="text-right">ISO AMT pref</TableHead>
                  <TableHead className="text-right">NSO ordinary</TableHead>
                  <TableHead className="text-right">83(b)</TableHead>
                  <TableHead className="text-right">Sale proceeds</TableHead>
                  <TableHead className="text-right">Capital gain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lifetimeRows.map((row) => (
                  <TableRow key={row.jobId}>
                    <TableCell className="font-medium">{row.name}{row.isCurrent ? ' (current)' : ''}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.estimatedRegularTax)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.estimatedAmt)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.totalEstimatedTax)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.freeCashFlow)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.totalValueMedium)}</TableCell>
                    <TableCell className="text-right">{hasCurrentJob ? formatSignedFriendlyMoney(row.totalValueDeltaMedium) : 'No current job'}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.isoAmtPreference)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.nsoOrdinaryIncome)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.eightyThreeBElectionAmount)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.equitySaleProceeds)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.equityCapitalGain)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Annual federal and AMT breakdown</CardTitle>
          <CardDescription>Per-year taxable compensation, ISO/NSO equity facts, and after-tax free cash flow from the projection.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[520px] overflow-auto rounded-lg border" aria-label="Annual after-tax equity breakdown table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Taxable comp</TableHead>
                  <TableHead className="text-right">NSO ordinary</TableHead>
                  <TableHead className="text-right">ISO AMT pref</TableHead>
                  <TableHead className="text-right">Sale proceeds</TableHead>
                  <TableHead className="text-right">Capital gain</TableHead>
                  <TableHead className="text-right">Regular tax</TableHead>
                  <TableHead className="text-right">AMT</TableHead>
                  <TableHead className="text-right">Total tax</TableHead>
                  <TableHead className="text-right">After-tax FCF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {annualRows.map((row) => (
                  <TableRow key={`${row.jobId}-${row.year}`}>
                    <TableCell>{row.jobName}</TableCell>
                    <TableCell>{row.year}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.taxableCompIncome)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.nsoOrdinaryIncome)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.isoAmtPreference)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.equitySaleProceeds)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.equityCapitalGain)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.estimatedRegularTax)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.estimatedAmt)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.totalEstimatedTax)}</TableCell>
                    <TableCell className="text-right">{formatFriendlyMoney(row.freeCashFlow)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equity tax source breakdown</CardTitle>
          <CardDescription>ISO, NSO, 83(b), and sale-proceeds source facts routed by the backend tax-facts engine.</CardDescription>
        </CardHeader>
        <CardContent>
          {sourceRows.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No equity tax source rows for this projection.</p>
          ) : (
            <div className="max-h-[420px] overflow-auto rounded-lg border" aria-label="Equity tax source breakdown table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Routing</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sourceRows.map((row) => (
                    <TableRow key={row.sourceId}>
                      <TableCell>{row.jobName}</TableCell>
                      <TableCell>
                        <span className="block font-medium">{sourceTypeLabel(row.sourceType)}</span>
                        <span className="block text-xs text-muted-foreground">{row.label}</span>
                      </TableCell>
                      <TableCell>{row.routing ?? 'Unrouted'}</TableCell>
                      <TableCell className="text-right">{formatFriendlyMoney(row.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function ProjectionLifetimeValue({ projection, onOpenDetail }: ProjectionLifetimeValueProps): ReactElement {
  const [selectedBand, setSelectedBand] = useState<ProjectionBand>('medium')
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>(() => projection.jobs.map((job) => job.id))
  const [jobSelectionTouched, setJobSelectionTouched] = useState(false)
  const rows = useMemo(() => mapLifetimeValueRows(projection), [projection])
  const currentRow = useMemo(() => rows.find((row) => row.isCurrent) ?? null, [rows])
  const projectionJobIds = useMemo(() => projection.jobs.map((job) => job.id), [projection.jobs])
  const effectiveSelectedJobIds = useMemo(() => {
    if (!jobSelectionTouched) {
      return projectionJobIds
    }

    const projectionJobIdSet = new Set(projectionJobIds)
    const retainedIds = selectedJobIds.filter((id) => projectionJobIdSet.has(id))

    return retainedIds.length > 0 || selectedJobIds.length === 0 ? retainedIds : projectionJobIds
  }, [jobSelectionTouched, projectionJobIds, selectedJobIds])
  const selectedJobIdSet = useMemo(() => new Set(effectiveSelectedJobIds), [effectiveSelectedJobIds])
  const visibleRows = useMemo(() => rows.filter((row) => selectedJobIdSet.has(row.jobId)), [rows, selectedJobIdSet])
  const hasCurrentJob = projection.currentJobId !== null

  const toggleJob = (jobId: string, checked: boolean): void => {
    setJobSelectionTouched(true)
    setSelectedJobIds((currentIds) => {
      const baseIds = jobSelectionTouched ? currentIds : effectiveSelectedJobIds

      if (checked) {
        return baseIds.includes(jobId) ? baseIds : [...baseIds, jobId]
      }

      return baseIds.filter((id) => id !== jobId)
    })
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 rounded-md border bg-card p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase text-muted-foreground">Outcome</div>
          <ButtonGroup role="group" aria-label="Lifetime value outcome">
            {(['low', 'medium', 'high'] as ProjectionBand[]).map((band) => (
              <Button key={band} type="button" size="sm" variant={selectedBand === band ? 'secondary' : 'outline'} onClick={() => setSelectedBand(band)} aria-pressed={selectedBand === band}>
                {BAND_LABELS[band]}
              </Button>
            ))}
          </ButtonGroup>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase text-muted-foreground">Jobs</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {projection.jobs.map((job) => (
              <label key={job.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={effectiveSelectedJobIds.includes(job.id)} onCheckedChange={(checked) => toggleJob(job.id, checked === true)} aria-label={`Show ${job.name}`} />
                <span>{job.name}{job.isCurrent ? ' (current)' : ''}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <PaperLifetimeValueChart projection={projection} selectedBand={selectedBand} selectedJobIds={effectiveSelectedJobIds} />

      <Card>
        <CardHeader>
          <CardTitle>Lifetime value comparison</CardTitle>
          <CardDescription>
            Lifetime totals are read from the projection for the selected outcome. Delta columns use server-computed deltas vs. current job.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead className="text-right">Cash comp</TableHead>
                  <TableHead className="text-right">Liquid equity {BAND_LABELS[selectedBand].toLowerCase()}</TableHead>
                  <TableHead className="text-right">Paper equity {BAND_LABELS[selectedBand].toLowerCase()}</TableHead>
                  <TableHead className="text-right">Liquid total {BAND_LABELS[selectedBand].toLowerCase()}</TableHead>
                  <TableHead className="text-right">Paper total {BAND_LABELS[selectedBand].toLowerCase()}</TableHead>
                  <TableHead className="text-right">Cash Δ</TableHead>
                  <TableHead className="text-right">Liquid total Δ</TableHead>
                  <TableHead className="text-right">Paper total Δ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={row.jobId}>
                    <TableCell className="font-medium">{row.name}{row.isCurrent ? ' (current)' : ''}</TableCell>
                    <TableCell className="text-right">
                      <LtvDrillButton jobId={row.jobId} jobName={row.name} metric="cash-comp" band={selectedBand} value={row.totalCashComp} onOpenDetail={onOpenDetail} />
                    </TableCell>
                    <TableCell className="text-right">
                      <LtvDrillButton jobId={row.jobId} jobName={row.name} metric="liquid-equity" band={selectedBand} value={lifetimeValue(row, selectedBand, 'totalEquity')} onOpenDetail={onOpenDetail} />
                    </TableCell>
                    <TableCell className="text-right">
                      <LtvDrillButton jobId={row.jobId} jobName={row.name} metric="paper-equity" band={selectedBand} value={lifetimeValue(row, selectedBand, 'totalPaperEquity')} onOpenDetail={onOpenDetail} />
                    </TableCell>
                    <TableCell className="text-right">
                      <LtvDrillButton jobId={row.jobId} jobName={row.name} metric="liquid-total" band={selectedBand} value={lifetimeValue(row, selectedBand, 'totalValue')} onOpenDetail={onOpenDetail} />
                    </TableCell>
                    <TableCell className="text-right">
                      <LtvDrillButton jobId={row.jobId} jobName={row.name} metric="paper-total" band={selectedBand} value={lifetimeValue(row, selectedBand, 'totalPaperValue')} onOpenDetail={onOpenDetail} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DeltaValue hasCurrentJob={hasCurrentJob} offerValue={row.totalCashComp} currentValue={currentRow?.totalCashComp ?? null} delta={row.cashCompDelta} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DeltaValue
                        hasCurrentJob={hasCurrentJob}
                        offerValue={lifetimeValue(row, selectedBand, 'totalValue')}
                        currentValue={currentRow ? lifetimeValue(currentRow, selectedBand, 'totalValue') : null}
                        delta={lifetimeValue(row, selectedBand, 'totalValueDelta')}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <DeltaValue
                        hasCurrentJob={hasCurrentJob}
                        offerValue={lifetimeValue(row, selectedBand, 'totalPaperValue')}
                        currentValue={currentRow ? lifetimeValue(currentRow, selectedBand, 'totalPaperValue') : null}
                        delta={lifetimeValue(row, selectedBand, 'totalPaperValueDelta')}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">Select at least one job to compare.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function ProjectionVestingBreakdown({ projection }: ProjectionProps): ReactElement {
  return (
    <div className="space-y-4">
      {projection.jobs.map((job) => (
        <Card key={job.id}>
          <CardHeader>
            <CardTitle>{job.name} equity vesting</CardTitle>
            <CardDescription>Vested and exercisable shares by grant and year.</CardDescription>
          </CardHeader>
          <CardContent>
            {job.vesting.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No equity vesting rows for this job.</p>
            ) : (
              <div className="overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Grant</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead className="text-right">Vested shares</TableHead>
                      <TableHead className="text-right">Exercisable shares</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {job.vesting.map((row) => (
                      <TableRow key={`${job.id}-${row.grantId}-${row.type}-${row.year}`} className={row.source === 'projected_refresher' ? 'border-dashed opacity-60' : undefined}>
                        <TableCell>{row.grantId}</TableCell>
                        <TableCell className="uppercase">{row.type}</TableCell>
                        <TableCell>{row.year}</TableCell>
                        <TableCell className="text-right">{formatShares(row.vestedShares)}</TableCell>
                        <TableCell className="text-right">{formatShares(row.exercisableShares)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
