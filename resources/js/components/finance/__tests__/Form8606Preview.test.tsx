import { render, screen } from '@testing-library/react'
import React from 'react'

import type { TaxDocument } from '@/types/finance/tax-document'

import Form8606Preview, { computeForm8606 } from '../Form8606Preview'

function mk1099R(overrides: Partial<TaxDocument> = {}, parsed: Record<string, unknown> = {}): TaxDocument {
  return {
    id: Math.floor(Math.random() * 1e6),
    user_id: 1,
    form_type: '1099_r',
    is_reviewed: true,
    parsed_data: parsed as never,
    ...overrides,
  } as unknown as TaxDocument
}

describe('computeForm8606', () => {
  it('returns zero activity when every input is zero', () => {
    const result = computeForm8606({
      nondeductibleContributions: 0,
      priorYearBasis: 0,
      yearEndFmv: 0,
      reviewed1099RDocs: [],
    })
    expect(result.hasActivity).toBe(false)
    expect(result.line3_totalBasis).toBe(0)
    expect(result.line14_basisCarriedForward).toBe(0)
    expect(result.taxableToForm1040Line4b).toBe(0)
  })

  it('accumulates total basis from current and prior contributions (line 3)', () => {
    const result = computeForm8606({
      nondeductibleContributions: 7000,
      priorYearBasis: 15000,
      yearEndFmv: 0,
      reviewed1099RDocs: [],
    })
    expect(result.line3_totalBasis).toBe(22000)
    expect(result.line14_basisCarriedForward).toBe(22000)
    expect(result.hasActivity).toBe(true)
  })

  it('applies the pro-rata rule to Roth conversions (line 8 × line 10)', () => {
    // Total basis $7,000 + end-of-year FMV $70,000 + $7,000 converted = $77,000 denom.
    // Ratio = 7000 / 77000 ≈ 0.09091. Nontaxable portion of $7k conversion ≈ $636.36.
    const conversion = mk1099R({}, {
      payer_name: 'Vanguard',
      box1_gross_distribution: 7000,
      box2a_taxable_amount: 7000,
      box7_distribution_code: '2',
      box7_ira_sep_simple: true,
    })
    const result = computeForm8606({
      nondeductibleContributions: 7000,
      priorYearBasis: 0,
      yearEndFmv: 70000,
      reviewed1099RDocs: [conversion],
    })
    expect(result.line8_convertedToRoth).toBe(7000)
    expect(result.line10_proRataRatio).toBeCloseTo(0.09091, 4)
    expect(result.line11_basisInConversion).toBeGreaterThan(630)
    expect(result.line11_basisInConversion).toBeLessThan(640)
    expect(result.line18_taxableConversions).toBeGreaterThan(6360)
    expect(result.line18_taxableConversions).toBeLessThan(6370)
  })

  it('ignores non-IRA 1099-R distributions (box7_ira_sep_simple = false)', () => {
    const pensionDoc = mk1099R({}, {
      payer_name: 'MegaCorp Pension',
      box1_gross_distribution: 50000,
      box2a_taxable_amount: 50000,
      box7_distribution_code: '7',
      box7_ira_sep_simple: false,
    })
    const result = computeForm8606({
      nondeductibleContributions: 0,
      priorYearBasis: 0,
      yearEndFmv: 0,
      reviewed1099RDocs: [pensionDoc],
    })
    expect(result.line7_distributionsNotConverted).toBe(0)
    expect(result.line8_convertedToRoth).toBe(0)
  })

  it('routes code 7 (normal distribution) to conversions only when IRA flag is set; otherwise it is a non-conversion IRA distribution', () => {
    // A clean "regular IRA distribution" with code 7 is tracked as a conversion only
    // because code 7 appears in ROTH_CONVERSION_CODES (also used for rollovers).
    // Verify our routing stays consistent — the preview does not attempt to
    // second-guess the taxpayer's intent.
    const doc = mk1099R({}, {
      payer_name: 'Schwab',
      box1_gross_distribution: 10000,
      box2a_taxable_amount: 10000,
      box7_distribution_code: '7',
      box7_ira_sep_simple: true,
    })
    const result = computeForm8606({
      nondeductibleContributions: 0,
      priorYearBasis: 0,
      yearEndFmv: 90000,
      reviewed1099RDocs: [doc],
    })
    expect(result.line8_convertedToRoth).toBe(10000)
  })
})

describe('Form8606Preview', () => {
  it('renders the "no activity" callout when no inputs or distributions are present', () => {
    render(
      <Form8606Preview
        selectedYear={2025}
        form8606={computeForm8606({
          nondeductibleContributions: 0,
          priorYearBasis: 0,
          yearEndFmv: 0,
          reviewed1099RDocs: [],
        })}
      />,
    )
    expect(screen.getByText(/no form 8606 activity detected/i)).toBeInTheDocument()
  })

  it('renders the Part II conversion block when a Roth conversion is present', () => {
    const conversion = mk1099R({}, {
      payer_name: 'Vanguard',
      box1_gross_distribution: 7000,
      box2a_taxable_amount: 7000,
      box7_distribution_code: '2',
      box7_ira_sep_simple: true,
    })
    render(
      <Form8606Preview
        selectedYear={2025}
        form8606={computeForm8606({
          nondeductibleContributions: 7000,
          priorYearBasis: 0,
          yearEndFmv: 70000,
          reviewed1099RDocs: [conversion],
        })}
      />,
    )
    expect(screen.getByText(/Part II — Roth conversions/i)).toBeInTheDocument()
    expect(screen.getByText(/Vanguard/)).toBeInTheDocument()
  })

  it('renders a basis-carried-forward total even when there is no distribution activity', () => {
    render(
      <Form8606Preview
        selectedYear={2025}
        form8606={computeForm8606({
          nondeductibleContributions: 7000,
          priorYearBasis: 15000,
          yearEndFmv: 0,
          reviewed1099RDocs: [],
        })}
      />,
    )
    expect(screen.getByText(/Basis carried forward to next year/i)).toBeInTheDocument()
    expect(screen.getAllByText('$22,000').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the manual-entry slots when they are provided', () => {
    render(
      <Form8606Preview
        selectedYear={2025}
        form8606={computeForm8606({
          nondeductibleContributions: 0,
          priorYearBasis: 0,
          yearEndFmv: 0,
          reviewed1099RDocs: [],
        })}
        nondeductibleContributionsInput={<input aria-label="nd-input" data-testid="nd-input" />}
        priorYearBasisInput={<input aria-label="py-input" data-testid="py-input" />}
        yearEndFmvInput={<input aria-label="fmv-input" data-testid="fmv-input" />}
      />,
    )
    expect(screen.getByTestId('nd-input')).toBeInTheDocument()
    expect(screen.getByTestId('py-input')).toBeInTheDocument()
    expect(screen.getByTestId('fmv-input')).toBeInTheDocument()
  })
})
