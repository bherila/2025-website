import currency from 'currency.js'
import { AlertTriangle } from 'lucide-react'
import { type ReactElement, useId, useMemo, useState } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import SummaryTile from '@/components/ui/summary-tile'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import BalancesChart from './charts/BalancesChart'
import ConversionWindowChart from './charts/ConversionWindowChart'
import IncomeStackChart from './charts/IncomeStackChart'
import IrmaaTierChart from './charts/IrmaaTierChart'
import RmdRateChart from './charts/RmdRateChart'
import SsBreakevenChart from './charts/SsBreakevenChart'
import SsTaxationStepChart from './charts/SsTaxationStepChart'
import ScenarioCompareTable from './ScenarioCompareTable'
import type { RothConversionProjection, RothConversionScenarioProjection } from './types'

interface RothConversionResultsProps {
  projection: RothConversionProjection | null
  loading: boolean
}

function formatMoney(value: number | undefined): string {
  return currency(value ?? 0, { precision: 0 }).format()
}

function getPreferredScenario(projection: RothConversionProjection): RothConversionScenarioProjection {
  return projection.scenarios.find((scenario) => scenario.name === projection.inputs.strategy.name) ?? projection.scenarios[0]!
}

export default function RothConversionResults({ projection, loading }: RothConversionResultsProps): ReactElement {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  const scenarioSelectId = useId()
  const selectedScenario = useMemo(() => {
    if (!projection) {
      return null
    }

    return projection.scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? getPreferredScenario(projection)
  }, [projection, selectedScenarioId])

  if (!projection || !selectedScenario) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Projection</CardTitle>
          <CardDescription>{loading ? 'Calculating...' : 'Enter inputs to calculate the projection.'}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const finalYear = selectedScenario.years.at(-1)
  const warnings = projection.warnings ?? []
  const lifetimeTax = currency(selectedScenario.summary.lifetimeFederalTax)
    .add(selectedScenario.summary.lifetimeStateTax)
    .add(selectedScenario.summary.lifetimeNiit)
    .value

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={scenarioSelectId}>Scenario</Label>
          <Select
            value={selectedScenario.id}
            onValueChange={setSelectedScenarioId}
          >
            <SelectTrigger id={scenarioSelectId} className="w-full">
              <span className="truncate">{selectedScenario.name}</span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} sideOffset={4}>
              {projection.scenarios.map((scenario) => (
                <SelectItem key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="grid gap-1">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <SummaryTile title="Lifetime tax" kind="blue">{formatMoney(lifetimeTax)}</SummaryTile>
        <SummaryTile title="IRMAA hits" kind={selectedScenario.summary.irmaaHitYears > 0 ? 'yellow' : 'green'}>{selectedScenario.summary.irmaaHitYears} yrs</SummaryTile>
        <SummaryTile title="SS benefits" kind="green">{formatMoney(selectedScenario.summary.lifetimeSocialSecurity)}</SummaryTile>
        <SummaryTile title="Final estate">{formatMoney(selectedScenario.summary.finalEstateValue)}</SummaryTile>
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="years">Year-by-year</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="social-security">Social Security</TabsTrigger>
          <TabsTrigger value="tax-detail">Tax detail</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-6">
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Taxable income stack</CardTitle>
                <CardDescription>Ordinary income components with conversion and RMD layers.</CardDescription>
              </CardHeader>
              <CardContent className="h-[380px]">
                <IncomeStackChart years={selectedScenario.years} />
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
        </TabsContent>

        <TabsContent value="years">
          <Card>
            <CardHeader>
              <CardTitle>Year-by-year income</CardTitle>
              <CardDescription>MAGI is compared to the IRMAA tier determined by the two-year lookback.</CardDescription>
            </CardHeader>
            <CardContent className="h-[520px]">
              <IncomeStackChart years={selectedScenario.years} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances">
          <Card>
            <CardHeader>
              <CardTitle>Balances</CardTitle>
              <CardDescription>Ending balances after growth, RMDs, conversions, taxes, and cash shortfall withdrawals.</CardDescription>
            </CardHeader>
            <CardContent className="h-[520px]">
              <BalancesChart years={selectedScenario.years} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="social-security">
          <Card>
            <CardHeader>
              <CardTitle>Claiming comparison</CardTitle>
              <CardDescription>Cumulative primary benefits under three claiming ages.</CardDescription>
            </CardHeader>
            <CardContent className="h-[460px]">
              <SsBreakevenChart rows={selectedScenario.socialSecurityBreakeven} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tax-detail">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>IRMAA tiers</CardTitle>
                <CardDescription>Current-year MAGI plotted against surcharge ceilings.</CardDescription>
              </CardHeader>
              <CardContent className="h-[340px]">
                <IrmaaTierChart tiers={projection.reference.irmaaTiers} years={selectedScenario.years} />
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
                        <TableHead className="text-right">RMD</TableHead>
                        <TableHead className="text-right">Conversion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedScenario.years.map((year) => (
                        <TableRow key={year.calendarYear}>
                          <TableCell>{year.primaryAge}</TableCell>
                          <TableCell>{year.filingStatusLabel}</TableCell>
                          <TableCell className="text-right">{formatMoney(year.magi)}</TableCell>
                          <TableCell className="text-right">{formatMoney(year.federalTax)}</TableCell>
                          <TableCell className="text-right">{formatMoney(year.stateTax)}</TableCell>
                          <TableCell className="text-right">{formatMoney(year.niit)}</TableCell>
                          <TableCell className="text-right">{formatMoney(year.irmaa)}</TableCell>
                          <TableCell className="text-right">{formatMoney(year.totalTax)}</TableCell>
                          <TableCell className="text-right">{formatMoney(year.rmd)}</TableCell>
                          <TableCell className="text-right">{formatMoney(year.rothConversion)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="compare">
          <Card>
            <CardHeader>
              <CardTitle>Scenario compare</CardTitle>
              <CardDescription>Up to three strategies share the same base facts.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScenarioCompareTable scenarios={projection.scenarios} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
