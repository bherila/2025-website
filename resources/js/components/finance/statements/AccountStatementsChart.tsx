'use client'
import { format } from 'date-fns'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface ChartDataPoint {
  date: number
  balance: number
  costBasis: number
}

export default function AccountStatementsChart({ balanceHistory }: { balanceHistory: ChartDataPoint[] }) {
  const data = balanceHistory.map(({ date, balance, costBasis }) => ({
    date,
    balance,
    costBasis,
  }))

  return (
    <>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={data}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#666666" />
          <XAxis dataKey="date" tickFormatter={(date: Date) => format(new Date(date), "MMM ''yy")} />
          <YAxis />
          <Tooltip
            contentStyle={{
              backgroundColor: '#222222',
              border: 'none',
              borderRadius: '4px',
              color: '#ffffff',
            }}
            formatter={(value) => value !== undefined ? (value as number).toFixed(2) : ''}
            labelFormatter={(date: React.ReactNode) => format(new Date(Number(date ?? 0)), "MMM ''yy")}
          />
          <Legend />
          <Line type="monotone" dataKey="balance" name="Account Value" stroke="#1976D2" dot={false} />
          <Line type="monotone" dataKey="costBasis" name="Cost Basis" stroke="#E65100" dot={false} strokeDasharray="5 5" />
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}
