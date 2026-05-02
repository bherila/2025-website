import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'

import FinancialPlanningPage from '@/components/planning/FinancialPlanningPage'

describe('FinancialPlanningPage', () => {
  it('links to the retirement contribution calculator', () => {
    render(<FinancialPlanningPage />)

    const link = screen.getByRole('link', { name: /Retirement Contributions/i })

    expect(link).toHaveAttribute('href', '/financial-planning/retirement-contribution-calculator')
  })

  it('links to the rent vs buy calculator', () => {
    render(<FinancialPlanningPage />)

    const link = screen.getByRole('link', { name: /Rent vs\. Buy a Home/i })

    expect(link).toHaveAttribute('href', '/financial-planning/rent-vs-buy')
  })
})
