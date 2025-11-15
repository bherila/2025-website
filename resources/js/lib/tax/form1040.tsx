import React from 'react'
import type { Schedule1Data } from '@/lib/tax/schedule1'
import { schedule1, DialogSchedule1View } from '@/lib/tax/schedule1'
import type { Form172Data, Form172Inputs } from '@/lib/tax/form172'
import { DialogForm172View, form172, Form172View } from '@/lib/tax/form172'
import type { ScheduleDData } from '@/lib/tax/scheduleD'
import { scheduleD, DialogScheduleDView } from '@/lib/tax/scheduleD'
import { formatFriendlyAmount } from '@/lib/formatCurrency'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { DialogHeader } from '@/components/ui/dialog'
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog'

export interface Form1040Data {
  // Income
  f1040_line1z: number
  f1040_line2b: number
  f1040_line3b: number
  f1040_line4b: number
  f1040_line5b: number
  f1040_line6b: number
  f1040_line7: number
  f1040_line8: number // Schedule 1, line 10
  f1040_line9: number // total income
  f1040_line10: number // adjustments to income (Schedule 1, line 26)
  f1040_line11: number // AGI
  f1040_line12: number // standard/itemized deduction
  f1040_line13: number // QBI deduction
  f1040_line14: number // sum of 12+13
  f1040_line15: number // taxable income

  // Tax and credits (all zero for now)
  f1040_line16: number
  f1040_line17: number
  f1040_line18: number
  f1040_line19: number
  f1040_line20: number
  f1040_line21: number
  f1040_line22: number
  f1040_line23: number
  f1040_line24: number

  // Payments (all zero for now)
  f1040_line25d: number
  f1040_line26: number
  f1040_line32: number
  f1040_line33: number

  // Refund/Amount owed (all zero for now)
  f1040_line34: number
  f1040_line35a: number
  f1040_line36: number
  f1040_line37: number
  f1040_line38: number

  schedule1: Schedule1Data
  scheduleD: ScheduleDData
  form172output: Form172Data
}

export function form1040({
  wages = 0,
  interest = 0,
  dividends = 0,
  iraDistributions = 0,
  pensions = 0,
  socialSecurity = 0,
  nonBusinessCapGains = 0,
  businessIncome = 0,
  otherGains = 0,
  rentalIncome = 0,
  farmIncome = 0,
  nolDeductionFromOtherYears = 0,
  selfEmploymentTax = 0,
  sepSimpleQualifiedPlans = 0,
  selfEmployedHealthInsurance = 0,
  earlyWithdrawalPenalty = 0,
  businessCapGains = 0,
  standardDeduction = 14600, // 2024 single
  qbiDeduction = 0,
  isSingle = true,
  taxYear = 2024,
  override_f461_line15 = null, // Optional override for the maximum excess business loss
}: {
  wages?: number
  interest?: number
  dividends?: number
  iraDistributions?: number
  pensions?: number
  socialSecurity?: number
  nonBusinessCapGains?: number
  businessIncome?: number
  otherGains?: number
  rentalIncome?: number
  farmIncome?: number
  nolDeductionFromOtherYears?: number
  selfEmploymentTax?: number
  sepSimpleQualifiedPlans?: number
  selfEmployedHealthInsurance?: number
  earlyWithdrawalPenalty?: number
  businessCapGains?: number
  standardDeduction?: number
  qbiDeduction?: number
  isSingle?: boolean
  taxYear?: number
  override_f461_line15?: number | null // Optional override for the maximum excess business loss
}): Form1040Data {
  // Calculate Schedule D first
  const scheduleDData = scheduleD({
    line1a_gain_loss: nonBusinessCapGains, // Personal capital gains
    line5: businessCapGains, // Business capital gains
    isSingle,
  })

  const schedule1Data = schedule1({
    scheduleDData, // Pass the entire Schedule D data object
    businessIncome,
    otherGains,
    rentalIncome,
    farmIncome,
    netOperatingLoss: nolDeductionFromOtherYears,
    selfEmploymentTax,
    sepSimpleQualifiedPlans,
    selfEmployedHealthInsurance,
    earlyWithdrawalPenalty,
    taxYear,
    isSingle,
    override_f461_line15,
  })

  // Income lines
  const line1z = wages
  const line2b = interest
  const line3b = dividends
  const line4b = iraDistributions
  const line5b = pensions
  const line6b = socialSecurity
  const line7 = scheduleDData.schD_line21 // Use Schedule D limited amount
  const line8 = schedule1Data.sch1_line10
  const line9 = line1z + line2b + line3b + line4b + line5b + line6b + line7 + line8

  // Adjustments
  const line10 = schedule1Data.sch1_line26
  const line11 = line9 - line10

  // Deductions
  const line12 = standardDeduction
  const line13 = qbiDeduction
  const line14 = line12 + line13
  const line15 = Math.max(0, line11 - line14)

  // Tax and credits (all zero for now)
  const line16 = 0
  const line17 = 0
  const line18 = line16 + line17
  const line19 = 0
  const line20 = 0
  const line21 = line19 + line20
  const line22 = Math.max(0, line18 - line21)
  const line23 = 0
  const line24 = line22 + line23

  const form172output = form172({
    isIndividual: true,
    isMarriedFilingSeparately: !isSingle,
    p1_nonbusinessCapitalLosses: 0,
    p1_nonbusinessCapitalGains: nonBusinessCapGains ?? 0,
    p1_nonbusinessDeductions: 0,
    p1_nonbusinessIncomeOtherThanCapitalGains: 0,
    p1_businessCapitalLosses: 0,
    p1_businessCapitalGains: businessCapGains ?? 0,
    p1_section1202Exclusion: 0,
    p1_nolDeductionFromOtherYears: nolDeductionFromOtherYears ?? 0,
    part2Inputs: [],
  })

  // Payments (all zero for now)
  const line25d = 0
  const line26 = 0
  const line32 = 0
  const line33 = line25d + line26 + line32

  // Refund/Amount owed (all zero for now)
  const line34 = Math.max(0, line33 - line24)
  const line35a = 0
  const line36 = 0
  const line37 = Math.max(0, line24 - line33)
  const line38 = 0

  return {
    f1040_line1z: line1z,
    f1040_line2b: line2b,
    f1040_line3b: line3b,
    f1040_line4b: line4b,
    f1040_line5b: line5b,
    f1040_line6b: line6b,
    f1040_line7: line7,
    f1040_line8: line8,
    f1040_line9: line9,
    f1040_line10: line10,
    f1040_line11: line11,
    f1040_line12: line12,
    f1040_line13: line13,
    f1040_line14: line14,
    f1040_line15: line15,
    f1040_line16: line16,
    f1040_line17: line17,
    f1040_line18: line18,
    f1040_line19: line19,
    f1040_line20: line20,
    f1040_line21: line21,
    f1040_line22: line22,
    f1040_line23: line23,
    f1040_line24: line24,
    f1040_line25d: line25d,
    f1040_line26: line26,
    f1040_line32: line32,
    f1040_line33: line33,
    f1040_line34: line34,
    f1040_line35a: line35a,
    f1040_line36: line36,
    f1040_line37: line37,
    f1040_line38: line38,
    schedule1: schedule1Data,
    scheduleD: scheduleDData,
    form172output: form172output,
  }
}

const lines: { key: keyof Form1040Data; label: string }[] = [
  { key: 'f1040_line1z', label: '1z. Wages, salaries, tips, etc.' },
  { key: 'f1040_line2b', label: '2b. Taxable interest' },
  { key: 'f1040_line3b', label: '3b. Ordinary dividends' },
  { key: 'f1040_line4b', label: '4b. IRA distributions (taxable)' },
  { key: 'f1040_line5b', label: '5b. Pensions and annuities (taxable)' },
  { key: 'f1040_line6b', label: '6b. Social security benefits (taxable)' },
  { key: 'f1040_line7', label: '7. Capital gain or (loss)' },
  { key: 'f1040_line8', label: '8. Additional income (Schedule 1, line 10)' },
  { key: 'f1040_line9', label: '9. Total income' },
  { key: 'f1040_line10', label: '10. Adjustments to income (Schedule 1, line 26)' },
  { key: 'f1040_line11', label: '11. Adjusted gross income' },
  { key: 'f1040_line12', label: '12. Standard/itemized deduction' },
  { key: 'f1040_line13', label: '13. Qualified business income deduction' },
  { key: 'f1040_line14', label: '14. Add lines 12 and 13 (QBI deduction)' },
  { key: 'f1040_line15', label: '15. Taxable income' },
  { key: 'f1040_line16', label: '16. Tax' },
  { key: 'f1040_line17', label: '17. Amount from Schedule 2, line 3' },
  { key: 'f1040_line18', label: '18. Add lines 16 and 17' },
  { key: 'f1040_line19', label: '19. Child tax credit or credit for other dependents' },
  { key: 'f1040_line20', label: '20. Amount from Schedule 3, line 8' },
  { key: 'f1040_line21', label: '21. Add lines 19 and 20' },
  { key: 'f1040_line22', label: '22. Subtract line 21 from line 18' },
  { key: 'f1040_line23', label: '23. Other taxes, including self-employment tax' },
  { key: 'f1040_line24', label: '24. Add lines 22 and 23. Total tax' },
  { key: 'f1040_line25d', label: '25d. Total federal income tax withheld' },
  { key: 'f1040_line26', label: '26. Estimated tax payments and amount applied from prior year' },
  { key: 'f1040_line32', label: '32. Total other payments and refundable credits' },
  { key: 'f1040_line33', label: '33. Total payments' },
  { key: 'f1040_line34', label: '34. Overpaid (refund)' },
  { key: 'f1040_line35a', label: '35a. Amount refunded' },
  { key: 'f1040_line36', label: '36. Amount applied to next year' },
  { key: 'f1040_line37', label: '37. Amount you owe' },
  { key: 'f1040_line38', label: '38. Estimated tax penalty' },
]

export function Form1040View({ data, taxYear }: { data: Form1040Data; taxYear?: number }) {
  const nonZeroLines = lines.filter((line) => data[line.key] !== 0)
  return taxYear !== undefined && (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Line</TableHead>
            <TableHead>Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nonZeroLines.map((line) => {
            const value = data[line.key]
            if (typeof value !== 'number') {
              return null
            }
            return (
              <TableRow key={line.key}>
                <TableCell>{line.label}</TableCell>
                <TableCell>{formatFriendlyAmount(value)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <div className="mt-4">
        <DialogSchedule1View
          data={data.schedule1}
          taxYear={taxYear}
          trigger={
            <Button variant="outline" size="sm">
              View Schedule 1
            </Button>
          }
        />
        <DialogScheduleDView
          data={data.scheduleD}
          taxYear={taxYear}
          trigger={
            <Button variant="outline" size="sm">
              View Schedule D
            </Button>
          }
        />
        <DialogForm172View
          data={data.form172output}
          taxYear={taxYear}
          trigger={
            <Button variant="outline" size="sm">
              View Form 172
            </Button>
          }
        />
      </div>
    </>
  )
}

export function DialogForm1040View({
  data,
  taxYear,
  trigger,
}: {
  data: Form1040Data
  taxYear?: number
  trigger?: React.ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="link" size="sm">
            f1040
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Form 1040{taxYear ? ` for ${taxYear}` : ''}</DialogTitle>
        </DialogHeader>
        <Form1040View data={data} />
      </DialogContent>
    </Dialog>
  )
}
