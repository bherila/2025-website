import { render, screen } from '@testing-library/react'
import React from 'react'

import type { Form8606Facts } from '@/types/generated/tax-preview-facts'

import Form8606Preview from '../Form8606Preview'

function makeFacts(overrides: Partial<Form8606Facts> = {}): Form8606Facts {
  return {
    conversions: [],
    distributions: [],
    line1_nondeductibleContributions: 0,
    line2_priorYearBasis: 0,
    line3_totalBasis: 0,
    line6_yearEndFmv: 0,
    line7_distributionsNotConverted: 0,
    line8_convertedToRoth: 0,
    line9_total: 0,
    line10_proRataRatio: 0,
    line11_basisInConversion: 0,
    line12_basisInDistributions: 0,
    line13_totalBasisUsed: 0,
    line14_basisCarriedForward: 0,
    line15c_taxableDistributions: 0,
    line18_taxableConversions: 0,
    taxableToForm1040Line4b: 0,
    hasActivity: false,
    ...overrides,
  }
}

describe('Form8606Preview', () => {
  it('renders the facts loading placeholder before backend facts arrive', () => {
    render(<Form8606Preview selectedYear={2025} form8606={null} />)
    expect(screen.getByText(/form 8606 facts are not loaded yet/i)).toBeInTheDocument()
  })

  it('renders the "no activity" callout when no facts activity is present', () => {
    render(
      <Form8606Preview
        selectedYear={2025}
        form8606={makeFacts()}
      />,
    )
    expect(screen.getByText(/no form 8606 activity detected/i)).toBeInTheDocument()
  })

  it('renders the Part II conversion block when a Roth conversion is present', () => {
    render(
      <Form8606Preview
        selectedYear={2025}
        form8606={makeFacts({
          conversions: [{
            payerName: 'Vanguard',
            grossDistribution: 7000,
            taxableAmount: 7000,
            distributionCode: '2',
            isIra: true,
          }],
          line1_nondeductibleContributions: 7000,
          line3_totalBasis: 7000,
          line6_yearEndFmv: 70_000,
          line8_convertedToRoth: 7000,
          line9_total: 77_000,
          line10_proRataRatio: 0.09091,
          line11_basisInConversion: 636.36,
          line13_totalBasisUsed: 636.36,
          line14_basisCarriedForward: 6363.64,
          line18_taxableConversions: 6363.64,
          taxableToForm1040Line4b: 6363.64,
          hasActivity: true,
        })}
      />,
    )
    expect(screen.getByText(/Part II — Roth conversions/i)).toBeInTheDocument()
    expect(screen.getByText(/Vanguard/)).toBeInTheDocument()
  })

  it('renders a basis-carried-forward total from backend facts', () => {
    render(
      <Form8606Preview
        selectedYear={2025}
        form8606={makeFacts({
          line1_nondeductibleContributions: 7000,
          line2_priorYearBasis: 15_000,
          line3_totalBasis: 22_000,
          line14_basisCarriedForward: 22_000,
          hasActivity: true,
        })}
      />,
    )
    expect(screen.getByText(/Basis carried forward to next year/i)).toBeInTheDocument()
    expect(screen.getAllByText('$22,000').length).toBeGreaterThanOrEqual(1)
  })
})
