import currency from 'currency.js'
import { type ReactElement } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { RothConversionIrmaaTier, RothConversionYear } from '../types'

interface IrmaaTierChartProps {
  tiers: RothConversionIrmaaTier[]
  years: RothConversionYear[]
}

function formatMoney(value: number | string): string {
  return currency(value, { precision: 0 }).format()
}

export default function IrmaaTierChart({ tiers, years }: IrmaaTierChartProps): ReactElement {
  const latestMagi = years.at(0)?.magi ?? 0
  const data = tiers
    .filter((tier) => tier.maxMagi !== null)
    .map((tier) => ({
      label: tier.label,
      ceiling: tier.maxMagi ?? 0,
      annualSurcharge: tier.annualSurcharge,
    }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 16, right: 18, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" />
        <YAxis tickFormatter={(value: number) => formatMoney(value)} width={88} />
        <Tooltip formatter={(value) => formatMoney(value as number | string)} />
        <ReferenceLine y={latestMagi} stroke="#dc2626" strokeDasharray="4 4" label="Projected MAGI" />
        <Bar dataKey="ceiling" name="MAGI ceiling" fill="#2563eb" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
