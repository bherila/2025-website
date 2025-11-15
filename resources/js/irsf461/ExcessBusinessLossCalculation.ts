import { form1040 } from '@/lib/tax/form1040'
import { form461 } from '@/lib/tax/form461'

export function calculateExcessBusinessLoss({
  rows,
  isSingle,
  override_f461_line15 = null,
}: {
  isSingle: boolean
  rows: {
    year: number
    w2: number
    personalCapGain?: number
    capGain: number
    businessNetIncome: number
    override_f461_line15?: number | null
  }[]
  override_f461_line15?: number | null // Optional override for the maximum excess business loss
}) {
  let carryforward = 0
  return rows.map((row, idx) => {
    const startingNOL = carryforward

    // First calculate AGI without NOL to determine how much NOL can be used
    const preliminaryF1040 = form1040({
      wages: row.w2,
      interest: 0,
      dividends: 0,
      iraDistributions: 0,
      pensions: 0,
      socialSecurity: 0,
      nonBusinessCapGains: row.personalCapGain ?? 0, // Personal capital gains for Schedule D
      businessIncome: row.businessNetIncome,
      otherGains: 0,
      rentalIncome: 0,
      farmIncome: 0,
      nolDeductionFromOtherYears: 0, // No NOL for preliminary calculation
      selfEmploymentTax: 0,
      sepSimpleQualifiedPlans: 0,
      selfEmployedHealthInsurance: 0,
      earlyWithdrawalPenalty: 0,
      isSingle,
      taxYear: Number(row.year),
      override_f461_line15: row.override_f461_line15 ?? override_f461_line15 ?? null,
      businessCapGains: row.capGain, // Business capital gains
    })

    // Determine how much NOL can actually be used (limited by positive AGI)
    const agiBeforeNOL = preliminaryF1040.f1040_line11
    const nolUsed = Math.min(startingNOL, Math.max(0, agiBeforeNOL))

    // Now compute the final form1040 with the correct NOL amount
    const f1040 = form1040({
      wages: row.w2,
      interest: 0,
      dividends: 0,
      iraDistributions: 0,
      pensions: 0,
      socialSecurity: 0,
      nonBusinessCapGains: row.personalCapGain ?? 0, // Personal capital gains for Schedule D
      businessIncome: row.businessNetIncome,
      otherGains: 0,
      rentalIncome: 0,
      farmIncome: 0,
      nolDeductionFromOtherYears: nolUsed,
      selfEmploymentTax: 0,
      sepSimpleQualifiedPlans: 0,
      selfEmployedHealthInsurance: 0,
      earlyWithdrawalPenalty: 0,
      isSingle,
      taxYear: Number(row.year),
      override_f461_line15: row.override_f461_line15 ?? override_f461_line15 ?? null,
      businessCapGains: row.capGain, // Business capital gains
    })

    const f461 = f1040.schedule1.form461output ?? undefined
    const limit = f461?.f461_line15 ?? row.override_f461_line15 ?? override_f461_line15 ?? 0

    // The excess business loss disallowed by Form 461 automatically becomes NOL carryforward
    const disallowedLoss = f461?.f461_line16 ?? 0

    // Calculate the allowed business loss (the portion that's not disallowed)
    // This should be the net business income (including capital gains) minus the disallowed portion
    const netBusinessIncome = f461?.f461_line9 ?? row.businessNetIncome + row.capGain
    const allowedLoss =
      netBusinessIncome < 0
        ? netBusinessIncome + disallowedLoss // Add back the disallowed portion to get the allowed loss
        : netBusinessIncome

    // Calculate how much NOL was actually used (this should match what we calculated above)
    const actualNolUsed = nolUsed

    // Current year NOL: any remaining negative AGI creates new NOL
    const currentYearNOL = Math.max(0, -f1040.f1040_line11)

    // Taxable income from form1040
    const taxableIncome = f1040.f1040_line15

    // Update carryforward for next year:
    // Unused NOL from prior years + current year's excess business loss + current year's NOL
    carryforward = startingNOL - actualNolUsed + disallowedLoss + currentYearNOL

    return {
      ...row,
      limit,
      startingNOL,
      allowedLoss,
      disallowedLoss,
      nolUsed: actualNolUsed,
      currentYearNOL,
      taxableIncome,
      f1040,
      sch1: f1040.schedule1,
    }
  })
}
