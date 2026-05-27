import currency from 'currency.js'
import React from 'react'

import type { LotWorkspaceSummary } from '@/types/finance/normalized-lot'

interface LotSummaryCardsProps {
  summary: LotWorkspaceSummary
  className?: string
}

function formatCurrency(value: number): string {
  return currency(value, { precision: 2 }).format()
}

export function LotSummaryCards({ summary, className = '' }: LotSummaryCardsProps): React.ReactElement {
  const cards = [
    { label: 'Total Proceeds', value: formatCurrency(summary.total_proceeds) },
    { label: 'Total Basis', value: formatCurrency(summary.total_basis) },
    { label: 'Wash Sale Adj.', value: formatCurrency(summary.total_wash_sale) },
    { label: 'Realized Gain/Loss', value: formatCurrency(summary.total_realized_gain), highlight: true },
    { label: 'Lots', value: summary.count.toLocaleString() },
  ]

  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 ${className}`}>
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border bg-card p-3 text-card-foreground shadow-sm">
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className={`text-sm font-semibold ${card.highlight ? (summary.total_realized_gain >= 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  )
}
