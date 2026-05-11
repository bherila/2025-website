import { type ReactElement } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { RothConversionReference } from '../types'

interface RmdRateChartProps {
  reference: RothConversionReference
}

export default function RmdRateChart({ reference }: RmdRateChartProps): ReactElement {
  const data = reference.rmdRates.map((row) => ({
    age: row.age,
    ratePercent: row.rate * 100,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="age" allowDecimals={false} />
        <YAxis tickFormatter={(value: number) => `${value.toFixed(1)}%`} width={56} />
        <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} labelFormatter={(value) => `Age ${value}`} />
        <Line type="monotone" dataKey="ratePercent" name="RMD rate" stroke="#ea580c" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
