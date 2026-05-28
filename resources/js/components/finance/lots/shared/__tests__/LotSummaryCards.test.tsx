import { render, screen } from '@testing-library/react'

import type { LotWorkspaceSummary } from '@/types/finance/normalized-lot'

import { LotSummaryCards } from '../LotSummaryCards'

function mkSummary(overrides: Partial<LotWorkspaceSummary> = {}): LotWorkspaceSummary {
  return {
    total_proceeds: 0,
    total_basis: 0,
    total_wash_sale: 0,
    total_realized_gain: 0,
    count: 0,
    counts_by_source: {},
    counts_by_state: {},
    term_breakdown: {
      short: { proceeds: 0, basis: 0, realized_gain: 0, count: 0 },
      long: { proceeds: 0, basis: 0, realized_gain: 0, count: 0 },
    },
    ...overrides,
  }
}

describe('LotSummaryCards', () => {
  it('renders the legacy 5-card aggregate layout by default', () => {
    const summary = mkSummary({
      total_proceeds: 1000,
      total_basis: 800,
      total_wash_sale: 25,
      total_realized_gain: 200,
      count: 3,
    })

    render(<LotSummaryCards summary={summary} />)

    expect(screen.getByText('Total Proceeds')).toBeInTheDocument()
    expect(screen.getByText('Total Basis')).toBeInTheDocument()
    expect(screen.getByText('Wash Sale Adj.')).toBeInTheDocument()
    expect(screen.getByText('Realized Gain/Loss')).toBeInTheDocument()
    expect(screen.getByText('Lots')).toBeInTheDocument()
    expect(screen.getByText('$1,000.00')).toBeInTheDocument()
    expect(screen.getByText('$800.00')).toBeInTheDocument()
  })

  it('renders the 5-card ST/LT split when showTermBreakdown is true', () => {
    const summary = mkSummary({
      total_proceeds: 3000,
      total_basis: 2400,
      total_realized_gain: 600,
      count: 4,
      term_breakdown: {
        short: { proceeds: 1000, basis: 800, realized_gain: 200, count: 2 },
        long: { proceeds: 2000, basis: 1600, realized_gain: 400, count: 2 },
      },
    })

    render(<LotSummaryCards summary={summary} showTermBreakdown />)

    expect(screen.getByText('Short-term Proceeds (2)')).toBeInTheDocument()
    expect(screen.getByText('Long-term Proceeds (2)')).toBeInTheDocument()
    expect(screen.getByText('Short-term Basis')).toBeInTheDocument()
    expect(screen.getByText('Long-term Basis')).toBeInTheDocument()
    expect(screen.getByText('Total Realized Gain/Loss')).toBeInTheDocument()

    // ST proceeds = $1,000; LT proceeds = $2,000; total realized = $600
    expect(screen.getByText('$1,000.00')).toBeInTheDocument()
    expect(screen.getByText('$2,000.00')).toBeInTheDocument()
    expect(screen.getByText('$600.00')).toBeInTheDocument()

    // ST/LT gain secondaries
    expect(screen.getByText('Gain/(Loss) $200.00')).toBeInTheDocument()
    expect(screen.getByText('Gain/(Loss) $400.00')).toBeInTheDocument()
  })

  it('sums short + long realized gain via currency math for the total card', () => {
    const summary = mkSummary({
      term_breakdown: {
        // 0.10 + 0.20 → currency.js → 0.30 (raw + would yield 0.30000000000000004)
        short: { proceeds: 100, basis: 99.9, realized_gain: 0.1, count: 1 },
        long: { proceeds: 200, basis: 199.8, realized_gain: 0.2, count: 1 },
      },
    })

    render(<LotSummaryCards summary={summary} showTermBreakdown />)

    expect(screen.getByText('$0.30')).toBeInTheDocument()
  })
})
