import { render, screen } from '@testing-library/react'
import React from 'react'

import type { ScheduleFFacts } from '@/types/generated/tax-preview-facts'

import ScheduleFPreview from '../ScheduleFPreview'

function makeFacts(overrides: Partial<ScheduleFFacts> = {}): ScheduleFFacts {
  return {
    grossIncomeSources: [],
    expenseSources: [],
    line34Sources: [],
    grossFarmIncome: 0,
    totalFarmExpenses: 0,
    netFarmProfit: 0,
    hasActivity: false,
    ...overrides,
  }
}

describe('ScheduleFPreview', () => {
  it('renders the facts loading placeholder before backend facts arrive', () => {
    render(<ScheduleFPreview selectedYear={2025} scheduleF={null} />)
    expect(screen.getByText(/schedule f facts are not loaded yet/i)).toBeInTheDocument()
  })

  it('renders the "no activity" callout when backend facts are zero', () => {
    render(
      <ScheduleFPreview
        selectedYear={2025}
        scheduleF={makeFacts()}
      />,
    )
    expect(screen.getByText(/no schedule f activity detected/i)).toBeInTheDocument()
  })

  it('renders a Schedule SE callout when net profit is positive', () => {
    render(
      <ScheduleFPreview
        selectedYear={2025}
        scheduleF={makeFacts({
          grossFarmIncome: 50_000,
          totalFarmExpenses: 10_000,
          netFarmProfit: 40_000,
          hasActivity: true,
        })}
      />,
    )
    expect(screen.getByText(/self-employment tax implication/i)).toBeInTheDocument()
  })

  it('renders a passive-loss warning when net is negative', () => {
    render(
      <ScheduleFPreview
        selectedYear={2025}
        scheduleF={makeFacts({
          grossFarmIncome: 10_000,
          totalFarmExpenses: 15_000,
          netFarmProfit: -5_000,
          hasActivity: true,
        })}
      />,
    )
    expect(screen.getByText(/passive\/active participation matters/i)).toBeInTheDocument()
  })
})
