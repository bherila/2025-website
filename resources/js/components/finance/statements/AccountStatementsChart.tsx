'use client'
import { format } from 'date-fns'
import { CartesianGrid, Line, LineChart, ResponsiveContainer,Tooltip, XAxis, YAxis } from 'recharts'

export default function AccountStatementsChart({ balanceHistory }: { balanceHistory: [number, number][] }) {
  const data = balanceHistory.map(([date, balance]) => ({
    date: date,
    balance: balance,
  }))

  return (
    <>
      {/* <pre>{JSON.stringify(balanceHistory)}</pre> */}
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
          <XAxis dataKey="date" tickFormatter={(date: Date) => format(new Date(date), 'MMM ’yy')} />
          <YAxis />
          <Tooltip
            contentStyle={{
              backgroundColor: '#222222',
              border: 'none',
              borderRadius: '4px',
              color: '#ffffff',
            }}
            formatter={(value) => value !== undefined ? (value as number).toFixed(2) : ''}
            labelFormatter={(date: React.ReactNode) => format(new Date(Number(date ?? 0)), "MMM 'yy")}
          />
          <Line type="monotone" dataKey="balance" stroke="#1976D2" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}
