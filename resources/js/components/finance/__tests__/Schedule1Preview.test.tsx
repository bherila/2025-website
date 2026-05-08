import { fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'

import type { Schedule1Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import Schedule1Preview from '../Schedule1Preview'
import { TAX_TABS } from '../tax-tab-ids'

function makeSource(overrides: Partial<TaxFactSource> = {}): TaxFactSource {
  return {
    sourceType: 'test',
    routing: null,
    id: 'source-1',
    label: 'Test source',
    amount: 0,
    taxDocumentId: null,
    taxDocumentAccountId: null,
    accountId: null,
    formType: null,
    box: null,
    code: null,
    routingReason: null,
    notes: null,
    isReviewed: true,
    reviewStatus: 'reviewed',
    reviewAction: null,
    ...overrides,
  }
}

function makeFacts(overrides: Partial<Schedule1Facts> = {}): Schedule1Facts {
  return {
    line1aSources: [],
    line2aSources: [],
    line3Sources: [],
    line4Sources: [],
    line5Sources: [],
    line6Sources: [],
    line7Sources: [],
    line8zSources: [],
    line8Sources: [],
    line8bSources: [],
    line8hSources: [],
    line8iSources: [],
    line15Sources: [],
    line1aTotal: 0,
    line2aTotal: 0,
    line3Total: 0,
    line4Total: 0,
    line5Total: 0,
    line6Total: 0,
    line7Total: 0,
    line8bTotal: 0,
    line8hTotal: 0,
    line8iTotal: 0,
    line8zTotal: 0,
    line9TotalOtherIncome: 0,
    line15Total: 0,
    ...overrides,
  }
}

describe('Schedule1Preview', () => {
  it('renders the facts loading placeholder before backend facts arrive', () => {
    render(<Schedule1Preview selectedYear={2025} taxFacts={null} />)
    expect(screen.getByText(/schedule 1 facts are not loaded yet/i)).toBeInTheDocument()
  })

  it('renders Part I with an empty-lines disclosure when every backend fact is zero', () => {
    render(
      <Schedule1Preview
        selectedYear={2025}
        taxFacts={makeFacts()}
      />,
    )

    expect(screen.getByText('Part I — Additional Income')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /part i — show \d+ empty lines/i })).toBeInTheDocument()
  })

  it('renders only lines that have non-zero facts', () => {
    render(
      <Schedule1Preview
        selectedYear={2025}
        taxFacts={makeFacts({
          line3Total: 5000,
          line8zTotal: 750,
          line9TotalOtherIncome: 750,
        })}
      />,
    )

    expect(screen.getByText('Business income or (loss)')).toBeInTheDocument()
    expect(screen.queryByText('Rental real estate, royalties, partnerships, S corporations, trusts')).not.toBeInTheDocument()
    expect(screen.getByText('Other income')).toBeInTheDocument()
  })

  it('renders the line 10 Part I total and line 26 Part II total from facts', () => {
    render(
      <Schedule1Preview
        selectedYear={2025}
        taxFacts={makeFacts({
          line3Total: 5000,
          line5Total: 1200,
          line8zTotal: 750,
          line9TotalOtherIncome: 750,
          line15Total: 706.48,
        })}
      />,
    )

    expect(screen.getByText('Total additional income (to Form 1040 line 8)')).toBeInTheDocument()
    expect(screen.getByText('$6,950')).toBeInTheDocument()
    expect(screen.getByText('Total adjustments to income (to Form 1040 line 10)')).toBeInTheDocument()
    expect(screen.getAllByText('$706').length).toBeGreaterThanOrEqual(1)
  })

  it('surfaces Part II placeholder lines via the disclosure', () => {
    render(
      <Schedule1Preview
        selectedYear={2025}
        taxFacts={makeFacts()}
      />,
    )

    const partIIToggle = screen.getByRole('button', { name: /part ii — show 4 empty lines/i })
    fireEvent.click(partIIToggle)
    expect(screen.getByText('Health savings account (HSA) deduction')).toBeInTheDocument()
    expect(screen.getByText('Self-employed health insurance deduction')).toBeInTheDocument()
    expect(screen.getByText('IRA deduction')).toBeInTheDocument()
    expect(screen.getByText('Student loan interest deduction')).toBeInTheDocument()
  })

  it('provides a Go-to-source button for Schedule C when onTabChange is wired', () => {
    const onTabChange = jest.fn()
    render(
      <Schedule1Preview
        selectedYear={2025}
        taxFacts={makeFacts()}
        onTabChange={onTabChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /part i — show \d+ empty lines/i }))
    fireEvent.click(screen.getByRole('button', { name: /go to schedule c/i }))
    expect(onTabChange).toHaveBeenCalledWith(TAX_TABS.scheduleC)
  })

  it('opens source attribution from Schedule 1 fact sources', () => {
    render(
      <Schedule1Preview
        selectedYear={2025}
        taxFacts={makeFacts({
          line5Sources: [makeSource({ id: 'line5', label: 'Partnership — Schedule E net income/loss', amount: 1200 })],
          line5Total: 1200,
        })}
      />,
    )

    fireEvent.click(screen.getByText('Rental real estate, royalties, partnerships, S corporations, trusts'))
    const modal = screen.getByRole('dialog', { name: 'Schedule 1 Line 5 Supporting Details' })
    expect(within(modal).getByText('Partnership — Schedule E net income/loss')).toBeInTheDocument()
  })
})
