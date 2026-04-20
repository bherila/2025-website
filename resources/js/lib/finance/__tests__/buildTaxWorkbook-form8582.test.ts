import type { Form8582Lines, TaxReturn1040 } from '@/types/finance/tax-return'

import { buildTaxWorkbook } from '../buildTaxWorkbook'

function makeForm8582(overrides: Partial<Form8582Lines> = {}): Form8582Lines {
  return {
    activities: [
      {
        activityName: 'Rental Property',
        isRentalRealEstate: true,
        activeParticipation: true,
        currentIncome: 5_000,
        currentLoss: -20_000,
        priorYearUnallowed: -3_000,
        overallGainOrLoss: -18_000,
        allowedLossThisYear: 15_000,
        suspendedLossCarryforward: 3_000,
      },
      {
        activityName: 'LP Fund',
        isRentalRealEstate: false,
        activeParticipation: false,
        currentIncome: 0,
        currentLoss: -10_000,
        priorYearUnallowed: 0,
        overallGainOrLoss: -10_000,
        allowedLossThisYear: 0,
        suspendedLossCarryforward: 10_000,
      },
    ],
    totalPassiveIncome: 5_000,
    totalPassiveLoss: -30_000,
    totalPriorYearUnallowed: -3_000,
    netPassiveResult: -28_000,
    rentalAllowance: 10_000,
    totalAllowedLoss: 15_000,
    totalSuspendedLoss: 13_000,
    netDeductionToReturn: 15_000,
    isLossLimited: true,
    magi: 120_000,
    isMarried: false,
    realEstateProfessional: false,
    ...overrides,
  }
}

function makeTaxReturn(form8582: Form8582Lines): TaxReturn1040 {
  return { year: 2025, form8582 }
}

describe('buildTaxWorkbook — Form 8582 sheet', () => {
  it('includes Form 8582 sheet when form8582 has activities', () => {
    const wb = buildTaxWorkbook(makeTaxReturn(makeForm8582()))
    const sheet = wb.sheets.find((s) => s.name === 'Form 8582')
    expect(sheet).toBeDefined()
  })

  it('omits Form 8582 sheet when no activities', () => {
    const wb = buildTaxWorkbook(makeTaxReturn(makeForm8582({ activities: [] })))
    const sheet = wb.sheets.find((s) => s.name === 'Form 8582')
    expect(sheet).toBeUndefined()
  })

  it('includes Part I header and activity rows', () => {
    const wb = buildTaxWorkbook(makeTaxReturn(makeForm8582()))
    const sheet = wb.sheets.find((s) => s.name === 'Form 8582')!
    const descriptions = sheet.rows.map((r) => r.description)

    expect(descriptions).toContain('Part I — Passive Activities')
    expect(descriptions.some((d) => d?.includes('Rental Property') && d.includes('income'))).toBe(true)
    expect(descriptions.some((d) => d?.includes('Rental Property') && d.includes('loss'))).toBe(true)
    expect(descriptions.some((d) => d?.includes('prior-year unallowed'))).toBe(true)
  })

  it('includes Part II special allowance and MAGI', () => {
    const wb = buildTaxWorkbook(makeTaxReturn(makeForm8582()))
    const sheet = wb.sheets.find((s) => s.name === 'Form 8582')!
    const descriptions = sheet.rows.map((r) => r.description)

    expect(descriptions).toContain('Part II — Special Allowance')
    expect(descriptions).toContain('Modified AGI')
    expect(descriptions).toContain('Rental real estate special allowance')
  })

  it('includes Part III with totalAllowedLoss, netDeductionToReturn, and suspended loss', () => {
    const wb = buildTaxWorkbook(makeTaxReturn(makeForm8582()))
    const sheet = wb.sheets.find((s) => s.name === 'Form 8582')!
    const descriptions = sheet.rows.map((r) => r.description)

    expect(descriptions).toContain('Part III — Allowed vs. Suspended')
    expect(descriptions).toContain('Total allowed passive loss')
    expect(descriptions).toContain('Net deduction to return')
    expect(descriptions).toContain('Suspended loss — carried forward')
  })

  it('includes Worksheet 5 per-activity allocation rows', () => {
    const wb = buildTaxWorkbook(makeTaxReturn(makeForm8582()))
    const sheet = wb.sheets.find((s) => s.name === 'Form 8582')!
    const descriptions = sheet.rows.map((r) => r.description)

    expect(descriptions).toContain('Worksheet 5 — Per-Activity Allocation')
    expect(descriptions.some((d) => d?.includes('Rental Property') && d.includes('Allowed this year'))).toBe(true)
    expect(descriptions.some((d) => d?.includes('LP Fund') && d.includes('Suspended carryforward'))).toBe(true)
  })

  it('includes per-activity net gain/loss rows', () => {
    const wb = buildTaxWorkbook(makeTaxReturn(makeForm8582()))
    const sheet = wb.sheets.find((s) => s.name === 'Form 8582')!
    const descriptions = sheet.rows.map((r) => r.description)

    expect(descriptions).toContain('Per-Activity Net Gain/Loss')
    expect(descriptions.some((d) => d?.includes('Rental Property') && d.includes('Net gain/loss'))).toBe(true)
    expect(descriptions.some((d) => d?.includes('LP Fund') && d.includes('Net gain/loss'))).toBe(true)
  })

  it('includes RE professional election row when enabled', () => {
    const wb = buildTaxWorkbook(makeTaxReturn(makeForm8582({ realEstateProfessional: true })))
    const sheet = wb.sheets.find((s) => s.name === 'Form 8582')!
    const descriptions = sheet.rows.map((r) => r.description)

    expect(descriptions.some((d) => d?.includes('Real estate professional'))).toBe(true)
  })

  it('amounts in XLSX match Form8582Lines values', () => {
    const f = makeForm8582()
    const wb = buildTaxWorkbook(makeTaxReturn(f))
    const sheet = wb.sheets.find((s) => s.name === 'Form 8582')!

    const findAmount = (desc: string) => sheet.rows.find((r) => r.description === desc)?.amount
    expect(findAmount('Total passive income')).toBe(f.totalPassiveIncome)
    expect(findAmount('Total passive loss')).toBe(f.totalPassiveLoss)
    expect(findAmount('Net passive result')).toBe(f.netPassiveResult)
    expect(findAmount('Modified AGI')).toBe(f.magi)
    expect(findAmount('Rental real estate special allowance')).toBe(f.rentalAllowance)
    expect(findAmount('Total allowed passive loss')).toBe(-f.totalAllowedLoss)
    expect(findAmount('Net deduction to return')).toBe(-f.netDeductionToReturn)
    expect(findAmount('Suspended loss — carried forward')).toBe(-f.totalSuspendedLoss)
  })
})
