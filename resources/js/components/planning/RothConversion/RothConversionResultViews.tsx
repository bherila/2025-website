import currency from 'currency.js'
import { type ReactElement } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import SummaryTile from '@/components/ui/summary-tile'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import BalancesChart from './charts/BalancesChart'
import ConversionWindowChart from './charts/ConversionWindowChart'
import IncomeStackChart from './charts/IncomeStackChart'
import IrmaaTierChart from './charts/IrmaaTierChart'
import RmdRateChart from './charts/RmdRateChart'
import SsBreakevenChart from './charts/SsBreakevenChart'
import SsTaxationStepChart from './charts/SsTaxationStepChart'
import ScenarioCompareTable from './ScenarioCompareTable'
import type { RothConversionProjection, RothConversionScenarioProjection } from './types'

export function formatProjectionMoney(value: number | undefined): string {
  return currency(value ?? 0, { precision: 0 }).format()
}

export function getPreferredScenario(projection: RothConversionProjection): RothConversionScenarioProjection {
  return projection.scenarios.find((scenario) => scenario.name === projection.inputs.strategy.name) ?? projection.scenarios[0]!
}

export function getLifetimeTax(scenario: RothConversionScenarioProjection): number {
  return currency(scenario.summary.lifetimeFederalTax)
    .add(scenario.summary.lifetimeStateTax)
    .add(scenario.summary.lifetimeNiit)
    .value
}

export function ProjectionSummaryTiles({ scenario }: { scenario: RothConversionScenarioProjection }): ReactElement {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryTile title="Lifetime tax" kind="blue">
        {formatProjectionMoney(getLifetimeTax(scenario))}
      </SummaryTile>
      <SummaryTile title="IRMAA hits" kind={scenario.summary.irmaaHitYears > 0 ? 'yellow' : 'green'}>
        {scenario.summary.irmaaHitYears} yrs
      </SummaryTile>
      <SummaryTile title="SS benefits" kind="green">
        {formatProjectionMoney(scenario.summary.lifetimeSocialSecurity)}
      </SummaryTile>
      <SummaryTile title="Expenses" kind="yellow">
        {formatProjectionMoney(scenario.summary.lifetimeExpenses)}
      </SummaryTile>
      <SummaryTile title="Final estate">{formatProjectionMoney(scenario.summary.finalEstateValue)}</SummaryTile>
    </div>
  )
}

export function ProjectionOverview({
  projection,
  scenario,
}: {
  projection: RothConversionProjection
  scenario: RothConversionScenarioProjection
}): ReactElement {
  return (
    <div className="grid gap-6">
      <ProjectionSummaryTiles scenario={scenario} />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Taxable income stack</CardTitle>
            <CardDescription>Ordinary income components with conversion and RMD layers.</CardDescription>
          </CardHeader>
          <CardContent className="h-[380px]">
            <IncomeStackChart years={scenario.years} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conversion window</CardTitle>
            <CardDescription>Years available before age 73 RMD pressure.</CardDescription>
          </CardHeader>
          <CardContent className="h-[380px]">
            <ConversionWindowChart reference={projection.reference} />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>RMD rate ramp</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <RmdRateChart reference={projection.reference} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Taxable Social Security</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <SsTaxationStepChart reference={projection.reference} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function ProjectionYears({ scenario }: { scenario: RothConversionScenarioProjection }): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Year-by-year income</CardTitle>
        <CardDescription>MAGI is compared to the IRMAA tier determined by the two-year lookback.</CardDescription>
      </CardHeader>
      <CardContent className="h-[520px]">
        <IncomeStackChart years={scenario.years} />
      </CardContent>
    </Card>
  )
}

export function ProjectionBalances({ scenario }: { scenario: RothConversionScenarioProjection }): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Balances</CardTitle>
        <CardDescription>Ending balances after growth, RMDs, conversions, taxes, and cash shortfall withdrawals.</CardDescription>
      </CardHeader>
      <CardContent className="h-[520px]">
        <BalancesChart years={scenario.years} />
      </CardContent>
    </Card>
  )
}

export function ProjectionSocialSecurity({ scenario }: { scenario: RothConversionScenarioProjection }): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Claiming comparison</CardTitle>
        <CardDescription>Cumulative primary benefits under three claiming ages.</CardDescription>
      </CardHeader>
      <CardContent className="h-[460px]">
        <SsBreakevenChart rows={scenario.socialSecurityBreakeven} />
      </CardContent>
    </Card>
  )
}

export function ProjectionTaxDetail({
  projection,
  scenario,
}: {
  projection: RothConversionProjection
  scenario: RothConversionScenarioProjection
}): ReactElement {
  const finalYear = scenario.years.at(-1)

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>IRMAA tiers</CardTitle>
          <CardDescription>Current-year MAGI plotted against surcharge ceilings.</CardDescription>
        </CardHeader>
        <CardContent className="h-[340px]">
          <IrmaaTierChart tiers={projection.reference.irmaaTiers} years={scenario.years} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax detail</CardTitle>
          <CardDescription>{finalYear ? `Projection ends at age ${finalYear.primaryAge}.` : null}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[540px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Age</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">MAGI</TableHead>
                  <TableHead className="text-right">Federal</TableHead>
                  <TableHead className="text-right">State</TableHead>
                  <TableHead className="text-right">NIIT</TableHead>
                  <TableHead className="text-right">IRMAA</TableHead>
                  <TableHead className="text-right">Total tax</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Deduction</TableHead>
                  <TableHead className="text-right">RMD</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenario.years.map((year) => (
                  <TableRow key={year.calendarYear}>
                    <TableCell>{year.primaryAge}</TableCell>
                    <TableCell>{year.filingStatusLabel}</TableCell>
                    <TableCell className="text-right">{formatProjectionMoney(year.magi)}</TableCell>
                    <TableCell className="text-right">{formatProjectionMoney(year.federalTax)}</TableCell>
                    <TableCell className="text-right">{formatProjectionMoney(year.stateTax)}</TableCell>
                    <TableCell className="text-right">{formatProjectionMoney(year.niit)}</TableCell>
                    <TableCell className="text-right">{formatProjectionMoney(year.irmaa)}</TableCell>
                    <TableCell className="text-right">{formatProjectionMoney(year.totalTax)}</TableCell>
                    <TableCell className="text-right">{formatProjectionMoney(year.expenses.total)}</TableCell>
                    <TableCell className="text-right">{formatProjectionMoney(year.standardOrItemizedDeduction)}</TableCell>
                    <TableCell className="text-right">{formatProjectionMoney(year.rmd)}</TableCell>
                    <TableCell className="text-right">{formatProjectionMoney(year.rothConversion)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function ProjectionCompare({ projection }: { projection: RothConversionProjection }): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scenario compare</CardTitle>
        <CardDescription>Up to three strategies share the same base facts.</CardDescription>
      </CardHeader>
      <CardContent>
        <ScenarioCompareTable scenarios={projection.scenarios} />
      </CardContent>
    </Card>
  )
}
