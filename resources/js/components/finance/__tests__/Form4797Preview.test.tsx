import { render, screen } from '@testing-library/react'
import React from 'react'

import type { Form4797Facts } from '@/types/generated/tax-preview-facts'

import Form4797Preview from '../Form4797Preview'

function makeFacts(overrides: Partial<Form4797Facts> = {}): Form4797Facts {
  return {
    partISources: [],
    partIISources: [],
    partIIISources: [],
    schedule1Sources: [],
    scheduleDSources: [],
    partINet1231: 0,
    partIIOrdinary: 0,
    partIIIRecapture: 0,
    netToSchedule1Line4: 0,
    netToScheduleDLongTerm: 0,
    hasActivity: false,
    ...overrides,
  }
}

describe('Form4797Preview', () => {
  it('renders the facts loading placeholder before backend facts arrive', () => {
    render(<Form4797Preview selectedYear={2025} form4797={null} />)
    expect(screen.getByText(/form 4797 facts are not loaded yet/i)).toBeInTheDocument()
  })

  it('renders the "no activity" callout when backend facts are zero', () => {
    render(
      <Form4797Preview
        selectedYear={2025}
        form4797={makeFacts()}
      />,
    )
    expect(screen.getByText(/no form 4797 activity detected/i)).toBeInTheDocument()
  })

  it('renders the Schedule D long-term total from facts when Part I is net positive', () => {
    render(
      <Form4797Preview
        selectedYear={2025}
        form4797={makeFacts({
          partINet1231: 10_000,
          netToScheduleDLongTerm: 10_000,
          hasActivity: true,
        })}
      />,
    )
    expect(screen.getByText(/Net §1231 gain → Schedule D long-term/i)).toBeInTheDocument()
    expect(screen.getAllByText('$10,000').length).toBeGreaterThanOrEqual(1)
  })
})
