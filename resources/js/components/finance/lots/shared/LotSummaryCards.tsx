import currency from 'currency.js'
import React from 'react'

import type { LotWorkspaceSummary } from '@/types/finance/normalized-lot'

interface LotSummaryCardsProps {
  summary: LotWorkspaceSummary
  /**
   * When true, renders the 5-card ST/LT realized-gain breakdown
   * (ST proceeds+gain, ST basis, LT proceeds+gain, LT basis, total realized).
   * When false, renders the legacy aggregate-only card grid.
   */
  showTermBreakdown?: boolean
  className?: string
}

function formatCurrency(value: number): string {
  return currency(value, { precision: 2 }).format()
}

function gainClass(value: number): string {
  if (value > 0) return 'text-green-600'
  if (value < 0) return 'text-red-600'
  return ''
}

export function LotSummaryCards({
  summary,
  showTermBreakdown = false,
  className = '',
}: LotSummaryCardsProps): React.ReactElement {
  const cards = showTermBreakdown
    ? buildTermBreakdownCards(summary)
    : buildAggregateCards(summary)

  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 ${className}`}>
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border bg-card p-3 text-card-foreground shadow-sm">
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className={`text-sm font-semibold ${card.valueClass ?? ''}`}>{card.value}</p>
          {card.secondary !== undefined && (
            <p className={`mt-0.5 text-xs ${card.secondaryClass ?? 'text-muted-foreground'}`}>
              {card.secondary}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

interface SummaryCard {
  label: string
  value: string
  valueClass?: string
  secondary?: string
  secondaryClass?: string
}

function buildAggregateCards(summary: LotWorkspaceSummary): SummaryCard[] {
  return [
    { label: 'Total Proceeds', value: formatCurrency(summary.total_proceeds) },
    { label: 'Total Basis', value: formatCurrency(summary.total_basis) },
    { label: 'Wash Sale Adj.', value: formatCurrency(summary.total_wash_sale) },
    {
      label: 'Realized Gain/Loss',
      value: formatCurrency(summary.total_realized_gain),
      valueClass: gainClass(summary.total_realized_gain),
    },
    { label: 'Lots', value: summary.count.toLocaleString() },
  ]
}

function buildTermBreakdownCards(summary: LotWorkspaceSummary): SummaryCard[] {
  const short = summary.term_breakdown?.short ?? { proceeds: 0, basis: 0, realized_gain: 0, count: 0 }
  const long = summary.term_breakdown?.long ?? { proceeds: 0, basis: 0, realized_gain: 0, count: 0 }
  const total = currency(short.realized_gain).add(long.realized_gain).value

  return [
    {
      label: `Short-term Proceeds (${short.count})`,
      value: formatCurrency(short.proceeds),
      secondary: `Gain/(Loss) ${formatCurrency(short.realized_gain)}`,
      secondaryClass: gainClass(short.realized_gain),
    },
    { label: 'Short-term Basis', value: formatCurrency(short.basis) },
    {
      label: `Long-term Proceeds (${long.count})`,
      value: formatCurrency(long.proceeds),
      secondary: `Gain/(Loss) ${formatCurrency(long.realized_gain)}`,
      secondaryClass: gainClass(long.realized_gain),
    },
    { label: 'Long-term Basis', value: formatCurrency(long.basis) },
    {
      label: 'Total Realized Gain/Loss',
      value: formatCurrency(total),
      valueClass: gainClass(total),
    },
  ]
}
