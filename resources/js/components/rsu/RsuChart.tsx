'use client'

import currency from 'currency.js'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer,Tooltip, XAxis, YAxis } from 'recharts'

import { getShares } from '@/components/rsu/helpers'
import { groupBy } from '@/lib/arrayUtils'
import type { IAward } from '@/types/finance'

const colors = ['#D32F2F', '#FF8F00', '#FFD600', '#388E3C', '#1976D2', '#7B1FA2']

type ChartMode = 'shares' | 'value'

function formatChartValue(v: number, mode: ChartMode): string {
  if (mode === 'value') {
    return currency(v).format()
  }
  return `${v.toLocaleString()} sh`
}

function formatAxisDate(d: string): string {
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function formatTooltipDate(d: string): string {
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatYTick(v: number, mode: ChartMode): string {
  if (mode === 'value') {
    if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000).toLocaleString()}k`
    return `$${v.toLocaleString()}`
  }
  return v.toLocaleString()
}

interface TooltipPayloadEntry {
  name: string
  value: number
  color: string
}

function RsuChartTooltip({
  active,
  payload,
  label,
  mode,
}: {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
  mode: ChartMode
}) {
  if (!active || !payload || payload.length === 0) return null
  const sorted = [...payload].filter((p) => p.value).sort((a, b) => b.value - a.value)
  const total = sorted.reduce((s, p) => s + (Number(p.value) || 0), 0)
  return (
    <div className="rounded bg-[#222] text-white text-sm shadow-lg px-3 py-2 min-w-[180px]">
      <div className="font-semibold mb-1 border-b border-white/20 pb-1">{label ? formatTooltipDate(label) : ''}</div>
      {sorted.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="tabular-nums">{formatChartValue(p.value, mode)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 mt-1 pt-1 border-t border-white/20 font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatChartValue(total, mode)}</span>
      </div>
    </div>
  )
}

export default function RsuChart({ rsu, mode = 'shares' }: { rsu: IAward[]; mode?: ChartMode }) {
  const award_ids = new Set<string>()
  const vests = groupBy(rsu, (vest) => vest.vest_date)
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
      const shares = getShares(vest) ?? 0
      if (mode === 'value') {
        // Use vest price if available, else fallback to last known price for that symbol
        const price = vest.vest_price ?? lastKnownPrice[vest.symbol!]
        o[vest.award_id!] = price != null ? currency(shares).multiply(price).value : 0
        // Update last known price if this vest has a price
        if (vest.vest_price != null) lastKnownPrice[vest.symbol!] = vest.vest_price
      } else {
        o[vest.award_id!] = shares
      }
    }
    dataSource.push(o)
  }

  return (
    <ResponsiveContainer width="100%" height={420}>
      <BarChart
        data={dataSource}
        margin={{
          top: 20,
          right: 30,
          left: 20,
          bottom: 50,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#666666" />
        <XAxis
          dataKey="vest_date"
          tickFormatter={formatAxisDate}
          angle={-35}
          textAnchor="end"
          height={60}
          tickMargin={8}
        />
        <YAxis tickFormatter={(v: number) => formatYTick(v, mode)} width={70} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<RsuChartTooltip mode={mode} />} />
        <Legend wrapperStyle={{ paddingTop: 16 }} />
        {Array.from(award_ids).map((award_id, index) => {
          const color = colors[index % colors.length]
          return <Bar key={award_id} dataKey={award_id} stackId="a" fill={color} />
        })}
      </BarChart>
    </ResponsiveContainer>
  )
}
