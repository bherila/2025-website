import { render, screen } from '@testing-library/react'
import React from 'react'

import ScheduleFPreview, { computeScheduleF } from '../ScheduleFPreview'

describe('computeScheduleF', () => {
  it('returns zero activity when nothing is entered', () => {
    const result = computeScheduleF({ grossFarmIncome: 0, totalExpenses: 0 })
    expect(result.hasActivity).toBe(false)
    expect(result.netProfitOrLoss).toBe(0)
  })

  it('computes net profit as income − expenses', () => {
    const result = computeScheduleF({ grossFarmIncome: 50_000, totalExpenses: 32_500 })
    expect(result.netProfitOrLoss).toBe(17_500)
    expect(result.hasActivity).toBe(true)
  })

  it('produces a negative net when expenses exceed income', () => {
    const result = computeScheduleF({ grossFarmIncome: 10_000, totalExpenses: 15_000 })
    expect(result.netProfitOrLoss).toBe(-5_000)
  })
})

describe('ScheduleFPreview', () => {
  it('renders the "no activity" callout when nothing is entered', () => {
    render(
      <ScheduleFPreview
        selectedYear={2025}
        scheduleF={computeScheduleF({ grossFarmIncome: 0, totalExpenses: 0 })}
      />,
    )
    expect(screen.getByText(/no schedule f activity entered/i)).toBeInTheDocument()
  })

  it('renders a Schedule SE callout when net profit is positive', () => {
    render(
      <ScheduleFPreview
        selectedYear={2025}
        scheduleF={computeScheduleF({ grossFarmIncome: 50_000, totalExpenses: 10_000 })}
      />,
    )
    expect(screen.getByText(/self-employment tax implication/i)).toBeInTheDocument()
  })

  it('renders a passive-loss warning when net is negative', () => {
    render(
      <ScheduleFPreview
        selectedYear={2025}
        scheduleF={computeScheduleF({ grossFarmIncome: 10_000, totalExpenses: 15_000 })}
      />,
    )
    expect(screen.getByText(/passive\/active participation matters/i)).toBeInTheDocument()
  })

  it('renders the manual-entry slots when provided', () => {
    render(
      <ScheduleFPreview
        selectedYear={2025}
        scheduleF={computeScheduleF({ grossFarmIncome: 0, totalExpenses: 0 })}
        grossFarmIncomeInput={<input data-testid="income-input" />}
        totalExpensesInput={<input data-testid="expenses-input" />}
      />,
    )
    expect(screen.getByTestId('income-input')).toBeInTheDocument()
    expect(screen.getByTestId('expenses-input')).toBeInTheDocument()
  })
})
