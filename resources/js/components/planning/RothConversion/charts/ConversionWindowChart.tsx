import { type ReactElement } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { RothConversionReference } from '../types'

interface ConversionWindowChartProps {
  reference: RothConversionReference
}

export default function ConversionWindowChart({ reference }: ConversionWindowChartProps): ReactElement {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={reference.conversionWindows} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="retirementAge" label={{ value: 'Retirement age', position: 'insideBottom', offset: -4 }} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="yearsUntilRmd73" name="Years before age 73 RMDs" fill="#0891b2" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
