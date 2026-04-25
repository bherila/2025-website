import { render, screen } from '@testing-library/react'
import React from 'react'

import Schedule1Preview, { computeSchedule1Totals } from '../Schedule1Preview'

describe('computeSchedule1Totals', () => {
  it('returns zero totals when every input is zero', () => {
    const totals = computeSchedule1Totals({
      scheduleCNetIncome: 0,
      scheduleEGrandTotal: 0,
      schedule1OtherIncome: 0,
      deductibleSeTaxAdjustment: 0,
    })

    expect(totals).toEqual({
      partI: {
        line1a_taxableRefunds: null,
        line2a_alimonyReceived: null,
        line3_business: 0,
        line4_otherGains: null,
        line5_rentalPartnerships: 0,
        line6_farmIncome: null,
        line7_unemploymentCompensation: null,
        line8b_gambling: null,
        line8h_juryDuty: null,
        line8i_prizes: null,
        line8z_otherIncome: 0,
        line9_totalOther: 0,
        line10_total: 0,
      },
      partII: {
        line13_hsaDeduction: null,
        line15_deductibleSeTax: null,
        line17_selfEmployedHealthInsurance: null,
        line20_iraDeduction: null,
        line21_studentLoanInterest: null,
        line26_totalAdjustments: 0,
      },
    })
  })

  it('sums line 3 + line 5 + line 9 into line 10', () => {
    const totals = computeSchedule1Totals({
      scheduleCNetIncome: 5000,
      scheduleEGrandTotal: 1200,
      schedule1OtherIncome: 750,
      deductibleSeTaxAdjustment: 706.48,
    })

    expect(totals.partI.line9_totalOther).toBe(750)
    expect(totals.partI.line10_total).toBe(6950)
    expect(totals.partII.line15_deductibleSeTax).toBe(706.48)
    expect(totals.partII.line26_totalAdjustments).toBe(706.48)
  })

  it('handles negative Schedule E (net rental loss) in line 10', () => {
    const totals = computeSchedule1Totals({
      scheduleCNetIncome: 10_000,
      scheduleEGrandTotal: -2500,
      schedule1OtherIncome: 0,
      deductibleSeTaxAdjustment: 0,
    })

    expect(totals.partI.line10_total).toBe(7500)
  })

  it('routes sub-line breakdown to correct line 8 fields', () => {
    const totals = computeSchedule1Totals({
      schedule1Line8Breakdown: { line8b: 200, line8h: 50, line8i: 100, line8z: 400 },
    })

    expect(totals.partI.line8b_gambling).toBe(200)
    expect(totals.partI.line8h_juryDuty).toBe(50)
    expect(totals.partI.line8i_prizes).toBe(100)
    expect(totals.partI.line8z_otherIncome).toBe(400)
    expect(totals.partI.line9_totalOther).toBe(750)
    expect(totals.partI.line10_total).toBe(750)
  })

  it('breakdown overrides schedule1OtherIncome when both provided', () => {
    const totals = computeSchedule1Totals({
      schedule1OtherIncome: 999,
      schedule1Line8Breakdown: { line8b: 0, line8h: 0, line8i: 0, line8z: 300 },
    })

    expect(totals.partI.line8z_otherIncome).toBe(300)
    expect(totals.partI.line9_totalOther).toBe(300)
  })

  it('wires 1099-G unemployment to line 7 and refunds to line 1a', () => {
    const totals = computeSchedule1Totals({
      schedule1Line7Unemployment: 1500,
      schedule1Line1aTaxableRefunds: 300,
    })

    expect(totals.partI.line7_unemploymentCompensation).toBe(1500)
    expect(totals.partI.line1a_taxableRefunds).toBe(300)
    expect(totals.partI.line10_total).toBe(1800)
  })
})

describe('Schedule1Preview', () => {
  it('renders the empty-state message when every Part I input is zero', () => {
    render(
      <Schedule1Preview
        selectedYear={2025}
        schedule1={computeSchedule1Totals({})}
      />,
    )

    expect(screen.getByText('No Schedule 1 Part I income for this year.')).toBeInTheDocument()
    expect(screen.queryByText('Part I — Additional Income')).not.toBeInTheDocument()
  })

  it('renders only lines that have non-zero values', () => {
    render(
      <Schedule1Preview
        selectedYear={2025}
        schedule1={computeSchedule1Totals({
          scheduleCNetIncome: 5000,
          schedule1OtherIncome: 750,
        })}
      />,
    )

    expect(screen.getByText('Business income or (loss)')).toBeInTheDocument()
    expect(screen.queryByText('Rental real estate, royalties, partnerships, S corporations, trusts')).not.toBeInTheDocument()
    expect(screen.getByText('Other income')).toBeInTheDocument()
  })

  it('renders the line 10 Part I total and line 26 Part II total', () => {
    render(
      <Schedule1Preview
        selectedYear={2025}
        schedule1={computeSchedule1Totals({
          scheduleCNetIncome: 5000,
          scheduleEGrandTotal: 1200,
          schedule1OtherIncome: 750,
          deductibleSeTaxAdjustment: 706.48,
        })}
      />,
    )

    expect(screen.getByText('Line 10 — Total additional income (to Form 1040 line 8)')).toBeInTheDocument()
    expect(screen.getByText('$6,950')).toBeInTheDocument()
    expect(screen.getByText('Line 26 — Total adjustments to income (to Form 1040 line 10)')).toBeInTheDocument()
    expect(screen.getAllByText('$706')).toHaveLength(2)
  })

  it('renders the Part II block with placeholders even when Part I is empty', () => {
    render(
      <Schedule1Preview
        selectedYear={2025}
        schedule1={computeSchedule1Totals({})}
      />,
    )

    expect(screen.getByText('Part II — Adjustments to Income')).toBeInTheDocument()
    expect(screen.getByText('Health savings account (HSA) deduction')).toBeInTheDocument()
    expect(screen.getByText('Self-employed health insurance deduction')).toBeInTheDocument()
    expect(screen.getByText('Student loan interest deduction')).toBeInTheDocument()
  })
})
