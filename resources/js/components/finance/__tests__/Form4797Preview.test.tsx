import { render, screen } from '@testing-library/react'
import React from 'react'

import Form4797Preview, { computeForm4797 } from '../Form4797Preview'

describe('computeForm4797', () => {
  it('returns zero activity when every input is zero', () => {
    const result = computeForm4797({ partINet1231: 0, partIIOrdinary: 0, partIIIRecapture: 0 })
    expect(result.hasActivity).toBe(false)
    expect(result.netToSchedule1Line4).toBe(0)
    expect(result.netToScheduleDLongTerm).toBe(0)
  })

  it('routes a net-positive Part I §1231 gain to Schedule D, not Schedule 1 line 4', () => {
    const result = computeForm4797({ partINet1231: 10_000, partIIOrdinary: 0, partIIIRecapture: 0 })
    expect(result.netToScheduleDLongTerm).toBe(10_000)
    expect(result.netToSchedule1Line4).toBe(0)
  })

  it('routes a net-negative Part I §1231 loss to Schedule 1 line 4 as ordinary', () => {
    const result = computeForm4797({ partINet1231: -4_000, partIIOrdinary: 0, partIIIRecapture: 0 })
    expect(result.netToSchedule1Line4).toBe(-4_000)
    expect(result.netToScheduleDLongTerm).toBe(0)
  })

  it('sums Part II ordinary + Part III recapture into Schedule 1 line 4', () => {
    const result = computeForm4797({ partINet1231: 0, partIIOrdinary: 2_000, partIIIRecapture: 3_000 })
    expect(result.netToSchedule1Line4).toBe(5_000)
  })

  it('combines a §1231 loss with Part II ordinary + Part III recapture into line 4', () => {
    const result = computeForm4797({ partINet1231: -1_000, partIIOrdinary: 500, partIIIRecapture: 200 })
    expect(result.netToSchedule1Line4).toBe(-300)
    expect(result.netToScheduleDLongTerm).toBe(0)
  })
})

describe('Form4797Preview', () => {
  it('renders the "no activity" callout when all inputs are zero', () => {
    render(
      <Form4797Preview
        selectedYear={2025}
        form4797={computeForm4797({ partINet1231: 0, partIIOrdinary: 0, partIIIRecapture: 0 })}
      />,
    )
    expect(screen.getByText(/no form 4797 activity entered/i)).toBeInTheDocument()
  })

  it('renders the Schedule D long-term total when Part I is net positive', () => {
    render(
      <Form4797Preview
        selectedYear={2025}
        form4797={computeForm4797({ partINet1231: 10_000, partIIOrdinary: 0, partIIIRecapture: 0 })}
      />,
    )
    expect(screen.getByText(/Net §1231 gain → Schedule D long-term/i)).toBeInTheDocument()
  })

  it('renders the manual-entry slots when provided', () => {
    render(
      <Form4797Preview
        selectedYear={2025}
        form4797={computeForm4797({ partINet1231: 0, partIIOrdinary: 0, partIIIRecapture: 0 })}
        partINet1231Input={<input data-testid="p1-input" />}
        partIIOrdinaryInput={<input data-testid="p2-input" />}
        partIIIRecaptureInput={<input data-testid="p3-input" />}
      />,
    )
    expect(screen.getByTestId('p1-input')).toBeInTheDocument()
    expect(screen.getByTestId('p2-input')).toBeInTheDocument()
    expect(screen.getByTestId('p3-input')).toBeInTheDocument()
  })
})
