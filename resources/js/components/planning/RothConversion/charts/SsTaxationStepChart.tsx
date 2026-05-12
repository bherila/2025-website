import currency from 'currency.js'
import { type ReactElement } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { RothConversionReference } from '../types'

interface SsTaxationStepChartProps {
  reference: RothConversionReference
}

export default function SsTaxationStepChart({ reference }: SsTaxationStepChartProps): ReactElement {
  const data = reference.socialSecurityTaxation.map((row) => ({
    provisionalIncome: row.provisionalIncome,
    taxablePercent: row.taxablePercent * 100,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="provisionalIncome" tickFormatter={(value: number) => currency(value, { precision: 0 }).format()} />
        <YAxis tickFormatter={(value: number) => `${value.toFixed(0)}%`} width={48} />
        <Tooltip
          formatter={(value) => `${Number(value).toFixed(0)}%`}
          labelFormatter={(value) => currency(value as number, { precision: 0 }).format()}
        />
        <Line type="stepAfter" dataKey="taxablePercent" name="Taxable SS" stroke="#2563eb" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
