import currency from 'currency.js'
import { type ReactElement } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { RothConversionScenarioProjection } from './types'

interface ScenarioCompareTableProps {
  scenarios: RothConversionScenarioProjection[]
}

function formatMoney(value: number): string {
  return currency(value, { precision: 0 }).format()
}

export default function ScenarioCompareTable({ scenarios }: ScenarioCompareTableProps): ReactElement {
  return (
    <div className="overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Scenario</TableHead>
            <TableHead className="text-right">Federal tax</TableHead>
            <TableHead className="text-right">IRMAA</TableHead>
            <TableHead className="text-right">SS benefits</TableHead>
            <TableHead className="text-right">Expenses</TableHead>
            <TableHead className="text-right">Final estate</TableHead>
            <TableHead className="text-right">PV estate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scenarios.map((scenario) => (
            <TableRow key={scenario.id}>
              <TableCell className="font-medium">{scenario.name}</TableCell>
              <TableCell className="text-right">{formatMoney(scenario.summary.lifetimeFederalTax)}</TableCell>
              <TableCell className="text-right">{formatMoney(scenario.summary.lifetimeIrmaa)}</TableCell>
              <TableCell className="text-right">{formatMoney(scenario.summary.lifetimeSocialSecurity)}</TableCell>
              <TableCell className="text-right">{formatMoney(scenario.summary.lifetimeExpenses)}</TableCell>
              <TableCell className="text-right">{formatMoney(scenario.summary.finalEstateValue)}</TableCell>
              <TableCell className="text-right">{formatMoney(scenario.summary.presentValueFinalEstate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
