import { type ReactElement, useMemo } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { AnnualFreeCashFlowChart } from './charts/AnnualFreeCashFlowChart'
import { LiquidityOverTimeChart } from './charts/LiquidityOverTimeChart'
import { formatMoney, formatShares, formatSignedMoney } from './formatters'
import { mapAfterTaxAnnualFreeCashFlowRows, mapAfterTaxLifetimeValueRows, mapAfterTaxSourceBreakdownRows, mapLifetimeValueRows } from './mappers'
import type { CareerCompProjection } from './types'

interface ProjectionProps {
  projection: CareerCompProjection
}

export function ProjectionLiquidity({ projection }: ProjectionProps): ReactElement {
  return <LiquidityOverTimeChart projection={projection} />
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
    equity_comp_83b_election: '83(b) election',
    equity_comp_sale_proceeds: 'Equity sale proceeds',
  }

  return labels[sourceType] ?? sourceType
}

export function ProjectionAfterTaxLiquidity({ projection }: ProjectionProps): ReactElement {
  if (!hasAfterTaxProjection(projection)) {
    return <AfterTaxUnavailable />
  }

  return <LiquidityOverTimeChart projection={projection} mode="afterTax" />
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {lifetimeRows.map((row) => (
                  <TableRow key={row.jobId}>
                    <TableCell className="font-medium">{row.name}{row.isCurrent ? ' (current)' : ''}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.estimatedRegularTax)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.estimatedAmt)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.totalEstimatedTax)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.freeCashFlow)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.totalValueMedium)}</TableCell>
                    <TableCell className="text-right">{hasCurrentJob ? formatSignedMoney(row.totalValueDeltaMedium) : 'No current job'}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.isoAmtPreference)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.nsoOrdinaryIncome)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.eightyThreeBElectionAmount)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.equitySaleProceeds)}</TableCell>
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
                    <TableCell className="text-right">{formatMoney(row.taxableCompIncome)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.nsoOrdinaryIncome)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.isoAmtPreference)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.equitySaleProceeds)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.estimatedRegularTax)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.estimatedAmt)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.totalEstimatedTax)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.freeCashFlow)}</TableCell>
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
                      <TableCell className="text-right">{formatMoney(row.amount)}</TableCell>
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

export function ProjectionLifetimeValue({ projection }: ProjectionProps): ReactElement {
  const rows = useMemo(() => mapLifetimeValueRows(projection), [projection])
  const hasCurrentJob = projection.currentJobId !== null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lifetime value comparison</CardTitle>
        <CardDescription>
          Lifetime totals are read from the projection. Delta columns use server-computed deltas vs. current job.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead className="text-right">Cash comp</TableHead>
                <TableHead className="text-right">Equity low</TableHead>
                <TableHead className="text-right">Equity med</TableHead>
                <TableHead className="text-right">Equity high</TableHead>
                <TableHead className="text-right">Total low</TableHead>
                <TableHead className="text-right">Total med</TableHead>
                <TableHead className="text-right">Total high</TableHead>
                <TableHead className="text-right">Cash Δ</TableHead>
                <TableHead className="text-right">Med total Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.jobId}>
                  <TableCell className="font-medium">{row.name}{row.isCurrent ? ' (current)' : ''}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.totalCashComp)}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.totalEquityLow)}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.totalEquityMedium)}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.totalEquityHigh)}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.totalValueLow)}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.totalValueMedium)}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.totalValueHigh)}</TableCell>
                  <TableCell className="text-right">{hasCurrentJob ? formatSignedMoney(row.cashCompDelta) : 'No current job'}</TableCell>
                  <TableCell className="text-right">{hasCurrentJob ? formatSignedMoney(row.totalValueDeltaMedium) : 'No current job'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
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
                      <TableRow key={`${job.id}-${row.grantId}-${row.type}-${row.year}`}>
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
