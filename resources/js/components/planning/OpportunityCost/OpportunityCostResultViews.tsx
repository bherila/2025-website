import { type ReactElement, useMemo } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { AnnualFreeCashFlowChart } from './charts/AnnualFreeCashFlowChart'
import { LiquidityOverTimeChart } from './charts/LiquidityOverTimeChart'
import { formatMoney, formatShares, formatSignedMoney } from './formatters'
import { mapLifetimeValueRows } from './mappers'
import type { OpportunityCostProjection } from './types'

interface ProjectionProps {
  projection: OpportunityCostProjection
}

export function ProjectionLiquidity({ projection }: ProjectionProps): ReactElement {
  return <LiquidityOverTimeChart projection={projection} />
}

export function ProjectionAnnualFreeCashFlow({ projection }: ProjectionProps): ReactElement {
  return <AnnualFreeCashFlowChart projection={projection} />
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
