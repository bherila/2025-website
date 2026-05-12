import currency from 'currency.js'
import { type ReactElement } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { RothConversionYear } from '../types'

interface BalancesChartProps {
  years: RothConversionYear[]
}

function formatMoney(value: number | string): string {
  return currency(value, { precision: 0 }).format()
}

export default function BalancesChart({ years }: BalancesChartProps): ReactElement {
  const data = years.map((year) => ({
    age: year.primaryAge,
    traditional: year.endingBalances.traditional,
    roth: year.endingBalances.roth,
    taxable: year.endingBalances.taxable,
    cash: year.endingBalances.cash,
    estateValue: year.estateValue,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 16, right: 20, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="age" allowDecimals={false} />
        <YAxis tickFormatter={(value: number) => formatMoney(value)} width={88} />
        <Tooltip formatter={(value) => formatMoney(value as number | string)} labelFormatter={(value) => `Age ${value}`} />
        <Legend />
        <Line type="monotone" dataKey="traditional" name="Pre-tax" stroke="#ea580c" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="roth" name="Roth" stroke="#16a34a" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="taxable" name="Taxable" stroke="#2563eb" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="estateValue" name="Estate value" stroke="#111827" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
