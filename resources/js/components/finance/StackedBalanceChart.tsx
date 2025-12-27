'use client'

import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import currency from 'currency.js'
import { format } from 'date-fns'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { formatFriendlyAmount } from '@/lib/formatCurrency'
import { Button } from '@/components/ui/button'

const colors = [
  // Blues
  '#0D47A1',
  '#1976D2',
  '#1565C0',
  // Reds
  '#D32F2F',
  '#C62828',
  '#B71C1C',
  // Oranges
  '#FF8F00',
  '#F57C00',
  '#EF6C00',
  // Yellows
  '#FFD600',
  '#FFC107',
  '#FFA000',
  // Greens
  '#388E3C',
  '#2E7D32',
  '#1B5E20',
  // Purples
  '#7B1FA2',
  '#6A1B9A',
  '#4A148C',
  // Teals
  '#00796B',
  '#00695C',
  '#004D40',
  // Pinks
  '#C2185B',
  '#AD1457',
  '#880E4F',
]

// Helper to convert chart data to TSV string
function generateTSV({
  data,
  labels,
  isNegative,
  isRetirement,
  includeLiabilities,
  includeRetirement,
}: {
  data: (string | number)[][]
  labels?: string[] | undefined
  isNegative?: boolean[] | undefined
  isRetirement?: boolean[] | undefined
  includeLiabilities: boolean
  includeRetirement: boolean
}) {
  // Filtered labels (accounts to include)
  const filteredLabels = labels
    ? labels.filter((_, i) => (!isNegative?.[i] || includeLiabilities) && (!isRetirement?.[i] || includeRetirement))
    : data[0]
      ? Array.from({ length: data[0].length - 1 }, (_, i) => `balance${i + 1}`)
      : []

  // Header row: Date + account columns
  const header = ['Date', ...filteredLabels]

  // Only include rows for quarters (date string includes 'Q')
  const rows = data
    .filter((row) => typeof row[0] === 'string' && row[0].includes('Q'))
    .map((row) => {
      const [date, ...balances] = row
      // For each filtered label, find its index in the original labels
      const values = filteredLabels.map((label) => {
        const idx = labels ? labels.indexOf(label) : parseInt(label.replace('balance', '')) - 1
        let val = balances[idx]
        // Convert to number, handle negatives
        if (typeof val === 'string') {
          val = val.replace(/,/g, '')
          val = val.startsWith('-') ? -parseFloat(val.slice(1)) : parseFloat(val)
        }
        return val
      })
      return [date, ...values]
    })

  // Build TSV string
  return [header, ...rows].map((row) => row.join('\t')).join('\n')
}

interface StackedBalanceChartProps {
  // Array of [date, balance1, balance2, ...] arrays
  data: (string | number)[][]
  // Optional labels for each balance column
  labels?: string[]
  // Optional flag to indicate which accounts are negative
  isNegative?: boolean[]
  // Optional flag to indicate which accounts are retirement
  isRetirement?: boolean[]
}

export default function StackedBalanceChart({ data, labels, isNegative, isRetirement }: StackedBalanceChartProps) {
  const [copyButtonText, setCopyButtonText] = useState('Copy raw data')
  const [includeLiabilities, setIncludeLiabilities] = useState(true)
  const [includeRetirement, setIncludeRetirement] = useState(true)
  const [groupByAccount, setGroupByAccount] = useState(true)

  // Handler for copying TSV to clipboard
  const handleCopyRawData = async () => {
    const tsv = generateTSV({
      data,
      labels,
      isNegative,
      isRetirement,
      includeLiabilities,
      includeRetirement,
    })
    try {
      await navigator.clipboard.writeText(tsv)
      setCopyButtonText('Copied!')
      setTimeout(() => setCopyButtonText('Copy raw data'), 2000)
    } catch {
      setCopyButtonText('Failed')
      setTimeout(() => setCopyButtonText('Copy raw data'), 2000)
    }
  }

  // Transform the data into the format recharts expects
  const chartData = data.map(([date, ...balances]) => {
    const dataPoint: { [key: string]: string | number } = {
      date: date ?? '',
    }

    let totalBalance = 0

    balances.forEach((balance, index) => {
      const label = labels?.[index] || `balance${index + 1}`
      const isNegativeAccount = isNegative?.[index] || false
      const isRetirementAccount = isRetirement?.[index] || false

      // Skip accounts based on filter checkboxes
      if ((isNegativeAccount && !includeLiabilities) || (isRetirementAccount && !includeRetirement)) {
        return
      }

      // Convert balance to number, handling negative values
      const numericBalance =
        typeof balance === 'string'
          ? currency(balance.replace(/^-/, '')).value * (balance.startsWith('-') ? -1 : 1)
          : balance

      totalBalance += numericBalance
      if (groupByAccount) {
        dataPoint[label] = isNegativeAccount ? -Math.abs(numericBalance) : numericBalance
      }
    })

    // Always calculate total net worth
    dataPoint['Net Worth'] = totalBalance

    return dataPoint
  })

  // Generate the balance keys (excluding the date column)
  const balanceKeys = groupByAccount
    ? labels
      ? labels.filter(
          (_, index) => (!isNegative?.[index] || includeLiabilities) && (!isRetirement?.[index] || includeRetirement)
        )
      : data[0]
        ? Array.from({ length: data[0].length - 1 }, (_, i) => `balance${i + 1}`)
        : []
    : ['Net Worth']

  return (
    <div>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={chartData}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#666666" />
          <XAxis
            dataKey="date"
            tickFormatter={(date: string) => {
              if (date.includes('Q')) {
                const [year, quarter] = date.split('-')
                return `${quarter} ${year}`
              }
              return format(new Date(date), "MMM 'yy")
            }}
          />
          <YAxis tickFormatter={(value) => formatFriendlyAmount(value)} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#222222',
              border: 'none',
              borderRadius: '4px',
              color: '#ffffff',
            }}
            formatter={(value: number) => currency(Math.abs(value)).format()}
            labelFormatter={(date: string) => {
              if (date.includes('Q')) {
                const [year, quarter] = date.split('-')
                return `${quarter} ${year}`
              }
              return format(new Date(date), "MMM 'yy")
            }}
          />
          {balanceKeys.map((key, index) => {
            const originalIndex = labels?.indexOf(key) ?? index
            const color = groupByAccount ? colors[originalIndex % colors.length] : colors[0]
            const isNegativeAccount = isNegative?.[originalIndex] || false
            const isRetirementAccount = isRetirement?.[originalIndex] || false

            return (
              <Bar
                key={key}
                dataKey={key}
                {...(groupByAccount ? { stackId: 'a' } : {})}
                fill={color}
                // Invert the bar for negative accounts
                {...(isNegativeAccount ? { fillOpacity: 0.5 } : {})}
                {...(isRetirementAccount ? { fillOpacity: 0.7, strokeDasharray: '5 5' } : {})}
              >
                {index === balanceKeys.length - 1 ? (
                  <LabelList
                    dataKey="Net Worth"
                    position="top"
                    formatter={(value: unknown) => formatFriendlyAmount(value as number)}
                    className="text-xs font-bold"
                  />
                ) : null}
              </Bar>
            )
          })}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-center space-x-8 mt-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="groupByAccount"
            checked={groupByAccount}
            onCheckedChange={(checked) => setGroupByAccount(!!checked)}
          />
          <Label htmlFor="groupByAccount">Group by account</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="includeLiabilities"
            checked={includeLiabilities}
            onCheckedChange={(checked) => setIncludeLiabilities(!!checked)}
          />
          <Label htmlFor="includeLiabilities">Include Liabilities</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="includeRetirement"
            checked={includeRetirement}
            onCheckedChange={(checked) => setIncludeRetirement(!!checked)}
          />
          <Label htmlFor="includeRetirement">Include Retirement</Label>
        </div>
        <Button onClick={handleCopyRawData} type="button">
          {copyButtonText}
        </Button>
      </div>
    </div>
  )
}
