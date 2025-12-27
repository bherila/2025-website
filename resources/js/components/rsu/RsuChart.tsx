'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { IAward } from '@/types/finance'
import _ from 'lodash'
import currency from 'currency.js'

const colors = ['#D32F2F', '#FF8F00', '#FFD600', '#388E3C', '#1976D2', '#7B1FA2']

export default function RsuChart({ rsu, mode = 'shares' }: { rsu: IAward[]; mode?: 'shares' | 'value' }) {
  const award_ids = new Set<string>()
  const vests = _.groupBy(rsu, 'vest_date')
  const dataSource = []

  // Find the most recent vest price for fallback
  const lastKnownPrice: { [symbol: string]: number | null } = {}
  for (const vest of rsu) {
    if (vest.vest_price != null) {
      lastKnownPrice[vest.symbol!] = vest.vest_price
    }
  }

  for (const vestDate of Object.keys(vests)) {
    const currentVests = vests[vestDate]
    if (!currentVests) continue

    const o: { [key: string]: string | number } = { vest_date: vestDate }
    for (const vest of currentVests) {
      award_ids.add(vest.award_id!)
      if (mode === 'value') {
        // Use vest price if available, else fallback to last known price for that symbol
        const price = vest.vest_price ?? lastKnownPrice[vest.symbol!]
        const shares = currency(vest.share_count!).value
        o[vest.award_id!] = price != null ? currency(shares).multiply(price).value : 0
        // Update last known price if this vest has a price
        if (vest.vest_price != null) lastKnownPrice[vest.symbol!] = vest.vest_price
      } else {
        o[vest.award_id!] = currency(vest.share_count!).value
      }
    }
    dataSource.push(o)
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart
        data={dataSource}
        margin={{
          top: 20,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#666666" />
        <XAxis dataKey="vest_date" />
        <YAxis />
        <Tooltip
          contentStyle={{
            backgroundColor: '#222222',
            border: 'none',
            borderRadius: '4px',
            color: '#ffffff',
          }}
          wrapperStyle={{
            backgroundColor: '#333333',
          }}
        />
        <Legend />
        {Array.from(award_ids).map((award_id, index) => {
          const color = colors[index % colors.length]
          return <Bar key={award_id} dataKey={award_id} stackId="a" fill={color} />
        })}
      </BarChart>
    </ResponsiveContainer>
  )
}
