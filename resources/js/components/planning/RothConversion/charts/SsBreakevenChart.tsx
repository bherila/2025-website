import currency from 'currency.js'
import { type ReactElement } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { RothConversionSsBreakevenRow } from '../types'

interface SsBreakevenChartProps {
  rows: RothConversionSsBreakevenRow[]
}

function formatMoney(value: number | string): string {
  return currency(value, { precision: 0 }).format()
}

export default function SsBreakevenChart({ rows }: SsBreakevenChartProps): ReactElement {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 16, right: 20, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="age" allowDecimals={false} />
        <YAxis tickFormatter={(value: number) => formatMoney(value)} width={88} />
        <Tooltip formatter={(value) => formatMoney(value as number | string)} labelFormatter={(value) => `Age ${value}`} />
        <Legend />
        <Line type="monotone" dataKey="claimAt62" name="Claim at 62" stroke="#dc2626" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="claimAtFra" name="Claim at FRA" stroke="#2563eb" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="claimAt70" name="Claim at 70" stroke="#16a34a" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
