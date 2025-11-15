import React from 'react'
import { formatFriendlyAmount } from '@/lib/formatCurrency'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Based on Form 172 (December 2024)

// PART I: NOL Calculation
export interface Form172Part1Data {
  p1_line1: number
  p1_line2: number
  p1_line3: number
  p1_line4: number
  p1_line5: number
  p1_line6: number
  p1_line7: number
  p1_line8: number
  p1_line9: number
  p1_line10: number
  p1_line11: number
  p1_line12: number
  p1_line13: number
  p1_line14: number
  p1_line15: number
  p1_line16: number
  p1_line17: number
  p1_line18: number
  p1_line19: number
  p1_line20: number
  p1_line21: number
  p1_line22: number
  p1_line23: number
  p1_line24: number // The final NOL
}

// PART II: NOL Carryover Calculation (for one carryover year)
export interface Form172Part2Data {
  year_ended: string
  p2_line1: number
  p2_line2: number
  p2_line3: number
  p2_line4: number
  p2_line5: number
  p2_line6: number
  p2_line7: number
  p2_line8: number
  p2_line9: number
  p2_line10: number
  // Adjustment to Itemized Deductions
  p2_line11: number
  p2_line12: number
  p2_line13: number
  p2_line14: number
  p2_line15: number
  p2_line16: number
  p2_line17: number
  p2_line18: number
  p2_line19: number
  p2_line20: number
  p2_line21: number
  p2_line22: number
  p2_line23: number
  p2_line24: number
  p2_line25: number
  p2_line26: number
  p2_line27: number
  p2_line28: number
  p2_line29: number
  p2_line30: number
  p2_line31: number
  p2_line32: number
  p2_line33: number
}

export interface Form172Data {
  part1: Form172Part1Data
  part2: Form172Part2Data[]
}

// Inputs for the calculation. Many of these will come from other forms.
export interface Form172Inputs {
  // General
  isIndividual: boolean // vs. Estate/Trust
  isMarriedFilingSeparately?: boolean

  // Part 1 Inputs
  p1_agi?: number
  p1_itemizedDeductions?: number
  p1_standardDeduction?: number
  p1_taxableIncome_estatesAndTrusts?: number
  p1_charitableDeduction_estatesAndTrusts?: number
  p1_incomeDistributionDeduction_estatesAndTrusts?: number
  p1_exemptionAmount_estatesAndTrusts?: number
  p1_nonbusinessCapitalLosses: number
  p1_nonbusinessCapitalGains: number
  p1_nonbusinessDeductions: number
  p1_nonbusinessIncomeOtherThanCapitalGains: number
  p1_businessCapitalLosses: number
  p1_businessCapitalGains: number
  p1_scheduleDCapitalLoss?: number
  p1_section1202Exclusion: number
  p1_nolDeductionFromOtherYears: number

  // Part 2 Inputs (per carryover year)
  part2Inputs: {
    year_ended: string
    p2_nolDeduction: number // NOL being carried to this year
    p2_taxableIncomeBeforeCarryback: number
    p2_netCapitalLossDeduction: number
    p2_section1202Exclusion: number
    p2_qbiDeduction: number
    p2_adjustmentToAgi: number
    p2_exemptionAmount_estatesAndTrusts?: number
    // For itemized deduction adjustment
    p2_itemizedDeductionsWereMade: boolean
    p2_agiBeforeCarryback?: number
    p2_medicalExpensesAfterLimit?: number
    p2_medicalExpensesBeforeLimit?: number
    p2_mortgageInsurancePremiums?: number
    p2_refiguredMortgageInsurancePremiums?: number
    p2_priorYearNolCarryback?: number
    p2_totalCharitableContributions?: number
    p2_refiguredCharitableContributions?: number
    p2_casualtyTheftLossDeduction?: number
    p2_casualtyTheftLossBeforeLimit?: number
  }[]
}

export function form172(inputs: Form172Inputs): Form172Data {
  // --- PART 1 CALCULATION ---
  const p1: Partial<Form172Part1Data> = {}

  if (inputs.isIndividual) {
    const deductions = Math.max(inputs.p1_itemizedDeductions ?? 0, inputs.p1_standardDeduction ?? 0)
    p1.p1_line1 = (inputs.p1_agi ?? 0) - deductions
  } else {
    // Estate or Trust
    p1.p1_line1 =
      (inputs.p1_taxableIncome_estatesAndTrusts ?? 0) +
      (inputs.p1_charitableDeduction_estatesAndTrusts ?? 0) +
      (inputs.p1_incomeDistributionDeduction_estatesAndTrusts ?? 0) +
      (inputs.p1_exemptionAmount_estatesAndTrusts ?? 0)
  }

  p1.p1_line2 = inputs.p1_nonbusinessCapitalLosses
  p1.p1_line3 = inputs.p1_nonbusinessCapitalGains
  p1.p1_line4 = Math.max(0, p1.p1_line2 - p1.p1_line3)
  p1.p1_line5 = Math.max(0, p1.p1_line3 - p1.p1_line2)
  p1.p1_line6 = inputs.p1_nonbusinessDeductions
  p1.p1_line7 = inputs.p1_nonbusinessIncomeOtherThanCapitalGains
  p1.p1_line8 = p1.p1_line5 + p1.p1_line7
  p1.p1_line9 = Math.max(0, p1.p1_line6 - p1.p1_line8)
  p1.p1_line10 = Math.min(Math.max(0, p1.p1_line8 - p1.p1_line6), p1.p1_line5)
  p1.p1_line11 = inputs.p1_businessCapitalLosses
  p1.p1_line12 = inputs.p1_businessCapitalGains
  p1.p1_line13 = p1.p1_line10 + p1.p1_line12
  p1.p1_line14 = Math.max(0, p1.p1_line11 - p1.p1_line13)
  p1.p1_line15 = p1.p1_line4 + p1.p1_line14

  if (inputs.p1_scheduleDCapitalLoss === undefined) {
    p1.p1_line16 = 0
    p1.p1_line17 = 0
    p1.p1_line18 = 0
    p1.p1_line19 = 0
    p1.p1_line20 = 0
    p1.p1_line21 = 0
    p1.p1_line22 = p1.p1_line15
  } else {
    p1.p1_line16 = inputs.p1_scheduleDCapitalLoss
    p1.p1_line17 = inputs.p1_section1202Exclusion
    p1.p1_line18 = Math.max(0, p1.p1_line16 - p1.p1_line17)
    const capitalLossLimit = inputs.isMarriedFilingSeparately ? 1500 : 3000
    p1.p1_line19 = Math.min(p1.p1_line16, capitalLossLimit)
    p1.p1_line20 = Math.max(0, p1.p1_line18 - p1.p1_line19)
    p1.p1_line21 = Math.max(0, p1.p1_line19 - p1.p1_line18)
    p1.p1_line22 = Math.max(0, p1.p1_line15 - p1.p1_line20)
  }

  p1.p1_line23 = inputs.p1_nolDeductionFromOtherYears
  const p1_total = p1.p1_line1 + p1.p1_line9 + p1.p1_line17 + p1.p1_line21 + p1.p1_line22 + p1.p1_line23
  p1.p1_line24 = p1_total < 0 ? p1_total : 0

  const part1Data = p1 as Form172Part1Data

  // --- PART 2 CALCULATION ---
  const part2Data = (inputs.part2Inputs ?? []).map((p2in) => {
    const p2: Partial<Form172Part2Data> = { year_ended: p2in.year_ended }

    p2.p2_line1 = p2in.p2_nolDeduction
    p2.p2_line2 = p2in.p2_taxableIncomeBeforeCarryback
    p2.p2_line3 = p2in.p2_netCapitalLossDeduction
    p2.p2_line4 = p2in.p2_section1202Exclusion
    p2.p2_line5 = p2in.p2_qbiDeduction
    p2.p2_line6 = p2in.p2_adjustmentToAgi
    p2.p2_line8 = p2in.p2_exemptionAmount_estatesAndTrusts ?? 0

    if (p2in.p2_itemizedDeductionsWereMade) {
      p2.p2_line11 = p2in.p2_agiBeforeCarryback ?? 0
      p2.p2_line12 = p2.p2_line3 + p2.p2_line4 + p2.p2_line5 + p2.p2_line6
      p2.p2_line13 = p2.p2_line11 + p2.p2_line12

      // Medical
      p2.p2_line14 = p2in.p2_medicalExpensesAfterLimit ?? 0
      p2.p2_line15 = p2in.p2_medicalExpensesBeforeLimit ?? 0
      p2.p2_line16 = p2.p2_line13 * 0.075
      p2.p2_line17 = Math.max(0, p2.p2_line15 - p2.p2_line16)
      p2.p2_line18 = p2.p2_line14 - p2.p2_line17

      // Mortgage Insurance
      p2.p2_line19 = p2in.p2_mortgageInsurancePremiums ?? 0
      p2.p2_line20 = p2in.p2_refiguredMortgageInsurancePremiums ?? 0
      p2.p2_line21 = p2.p2_line19 - p2.p2_line20

      // Charitable Contributions
      p2.p2_line22 = p2.p2_line13
      p2.p2_line23 = p2in.p2_priorYearNolCarryback ?? 0
      p2.p2_line24 = p2.p2_line22 + p2.p2_line23
      p2.p2_line25 = p2in.p2_totalCharitableContributions ?? 0
      p2.p2_line26 = p2in.p2_refiguredCharitableContributions ?? 0
      p2.p2_line27 = p2.p2_line25 - p2.p2_line26

      // Casualty/Theft
      p2.p2_line28 = p2in.p2_casualtyTheftLossDeduction ?? 0
      p2.p2_line29 = p2in.p2_casualtyTheftLossBeforeLimit ?? 0
      p2.p2_line30 = p2.p2_line22 * 0.1
      p2.p2_line31 = Math.max(0, p2.p2_line29 - p2.p2_line30)
      p2.p2_line32 = p2.p2_line28 - p2.p2_line31

      p2.p2_line33 = p2.p2_line18 + p2.p2_line21 + p2.p2_line27 + p2.p2_line32
      p2.p2_line7 = p2.p2_line33
    } else {
      p2.p2_line7 = 0
      // Zero out itemized deduction lines
      for (let i = 11; i <= 33; i++) {
        ;(p2 as any)[`p2_line${i}`] = 0
      }
    }

    p2.p2_line9 = Math.max(
      0,
      p2.p2_line2 + p2.p2_line3 + p2.p2_line4 + p2.p2_line5 + p2.p2_line6 + p2.p2_line7 + p2.p2_line8,
    )
    p2.p2_line10 = Math.max(0, p2.p2_line1 - p2.p2_line9)

    return p2 as Form172Part2Data
  })

  return {
    part1: part1Data,
    part2: part2Data,
  }
}

const part1Lines: { key: keyof Form172Part1Data; label: string }[] = [
  {
    key: 'p1_line1',
    label:
      '1. For individuals, subtract your standard deduction or itemized deductions from your adjusted gross income (AGI) and enter it here. For estates and trusts, enter taxable income increased by the total of the charitable deduction, income distribution deduction, and exemption amount.',
  },
  { key: 'p1_line2', label: '2. Nonbusiness capital losses before limitation (positive number).' },
  { key: 'p1_line3', label: '3. Nonbusiness capital gains (without regard to any section 1202 exclusion).' },
  { key: 'p1_line4', label: '4. If line 2 is more than line 3, enter the difference. Otherwise, enter -0-.' },
  { key: 'p1_line5', label: '5. If line 3 is more than line 2, enter the difference. Otherwise, enter -0-.' },
  { key: 'p1_line6', label: '6. Nonbusiness deductions (positive number).' },
  { key: 'p1_line7', label: '7. Nonbusiness income other than capital gains.' },
  { key: 'p1_line8', label: '8. Add lines 5 and 7.' },
  { key: 'p1_line9', label: '9. If line 6 is more than line 8, enter the difference. Otherwise, enter -0-.' },
  {
    key: 'p1_line10',
    label:
      '10. If line 8 is more than line 6, enter the difference. Otherwise, enter -0- (But don’t enter more than line 5).',
  },
  { key: 'p1_line11', label: '11. Business capital losses before limitation (positive number).' },
  { key: 'p1_line12', label: '12. Business capital gains (without regard to any section 1202 exclusion).' },
  { key: 'p1_line13', label: '13. Add lines 10 and 12.' },
  { key: 'p1_line14', label: '14. Subtract line 13 from line 11. If zero or less, enter -0-.' },
  { key: 'p1_line15', label: '15. Add lines 4 and 14.' },
  {
    key: 'p1_line16',
    label:
      '16. Enter, if any, the combined net short-term and long-term capital loss from your Schedule D (Form 1040). Estates and trusts, enter total net short-term and long-term loss from Schedule D (Form 1041). (positive number).',
  },
  { key: 'p1_line17', label: '17. Section 1202 exclusion (positive number).' },
  { key: 'p1_line18', label: '18. Subtract line 17 from line 16. If zero or less, enter -0-.' },
  {
    key: 'p1_line19',
    label:
      '19. If line 16 is a loss, enter the smaller of: the loss on line 16; or $3,000 ($1,500 if married filing separately).',
  },
  { key: 'p1_line20', label: '20. If line 18 is more than line 19, enter the difference. Otherwise, enter -0-.' },
  { key: 'p1_line21', label: '21. If line 19 is more than line 18, enter the difference. Otherwise, enter -0-.' },
  { key: 'p1_line22', label: '22. Subtract line 20 from line 15. If zero or less, enter -0-.' },
  { key: 'p1_line23', label: '23. NOL deduction for losses from other years (positive number).' },
  {
    key: 'p1_line24',
    label:
      '24. NOL. Combine lines 1, 9, 17, and 21 through 23. If the result is less than zero, enter it here. If the result is zero or more, you don’t have an NOL.',
  },
]

const part2Lines: { key: keyof Form172Part2Data | 'header'; label: string; indent?: boolean }[] = [
  { key: 'p2_line1', label: '1. NOL deduction' },
  { key: 'p2_line2', label: '2. Taxable income before NOL carryback' },
  { key: 'p2_line3', label: '3. Net capital loss deduction' },
  { key: 'p2_line4', label: '4. Section 1202 exclusion' },
  { key: 'p2_line5', label: '5. Qualified business income deduction' },
  { key: 'p2_line6', label: '6. Adjustment to adjusted gross income (AGI)' },
  { key: 'p2_line7', label: '7. Adjustment to itemized deductions (from line 33)' },
  { key: 'p2_line8', label: '8. Estates and trusts, enter exemption amount' },
  { key: 'p2_line9', label: '9. Modified taxable income' },
  { key: 'p2_line10', label: '10. NOL carryover to the subsequent year' },
  // Adjustment to Itemized Deductions
  { key: 'header', label: 'Adjustment to Itemized Deductions (Individuals Only)' },
  { key: 'p2_line11', label: '11. AGI before the current year NOL carryback', indent: true },
  { key: 'p2_line12', label: '12. Add lines 3 through 6 above', indent: true },
  { key: 'p2_line13', label: '13. Modified AGI', indent: true },
  { key: 'p2_line14', label: '14. Medical and dental expenses after AGI limitation', indent: true },
  { key: 'p2_line15', label: '15. Medical and dental expenses before AGI limitation', indent: true },
  { key: 'p2_line16', label: '16. Multiply line 13 by 7.5% (0.075)', indent: true },
  { key: 'p2_line17', label: '17. Subtract line 16 from line 15', indent: true },
  { key: 'p2_line18', label: '18. Subtract line 17 from line 14', indent: true },
  { key: 'p2_line19', label: '19. Mortgage insurance premiums', indent: true },
  { key: 'p2_line20', label: '20. Refigured mortgage insurance premiums', indent: true },
  { key: 'p2_line21', label: '21. Subtract line 20 from line 19', indent: true },
  { key: 'p2_line22', label: '22. Modified AGI from line 13', indent: true },
  { key: 'p2_line23', label: '23. Prior year NOL carryback deducted to figure line 11', indent: true },
  { key: 'p2_line24', label: '24. Add lines 22 and 23', indent: true },
  { key: 'p2_line25', label: '25. Total charitable contributions', indent: true },
  { key: 'p2_line26', label: '26. Refigured charitable contributions', indent: true },
  { key: 'p2_line27', label: '27. Subtract line 26 from line 25', indent: true },
  { key: 'p2_line28', label: '28. Casualty and theft losses deduction', indent: true },
  { key: 'p2_line29', label: '29. Casualty and theft losses before AGI limitation', indent: true },
  { key: 'p2_line30', label: '30. Multiply line 22 by 10% (0.10)', indent: true },
  { key: 'p2_line31', label: '31. Subtract line 30 from line 29', indent: true },
  { key: 'p2_line32', label: '32. Subtract line 31 from line 28', indent: true },
  { key: 'p2_line33', label: '33. Combine lines 18, 21, 27, and 32', indent: true },
]

function FormPart1View({ data }: { data: Form172Part1Data }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Line</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {part1Lines.map((line) => {
          const value = data[line.key]
          if (typeof value !== 'number' || value === 0) return null
          return (
            <TableRow key={line.key}>
              <TableCell>{line.label}</TableCell>
              <TableCell className="text-right">{formatFriendlyAmount(value)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function FormPart2View({ data }: { data: Form172Part2Data[] }) {
  return (
    <div>
      {data.map((item, index) => (
        <div key={index} className="mb-8">
          <h3 className="text-lg font-semibold mb-2">NOL Carryover to Year Ending: {item.year_ended}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {part2Lines.map((line, lineIndex) => {
                if (line.key === 'header') {
                  return (
                    <TableRow key={`${line.key}-${lineIndex}`}>
                      <TableCell colSpan={2} className="font-bold pt-4">
                        {line.label}
                      </TableCell>
                    </TableRow>
                  )
                }
                const value = item[line.key as keyof Form172Part2Data]
                if (typeof value !== 'number' || value === 0) return null
                return (
                  <TableRow key={line.key}>
                    <TableCell className={line.indent ? 'pl-8' : ''}>{line.label}</TableCell>
                    <TableCell className="text-right">{formatFriendlyAmount(value)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  )
}

export function Form172View({ data }: { data: Form172Data }) {
  return (
    <div>
      <h2 className="text-xl font-bold mb-2">Part I: NOL Calculation</h2>
      <FormPart1View data={data.part1} />
      <h2 className="text-xl font-bold mt-6 mb-2">Part II: NOL Carryover</h2>
      <FormPart2View data={data.part2} />
    </div>
  )
}

export function DialogForm172View({
  data,
  taxYear,
  trigger,
}: {
  data: Form172Data
  taxYear?: number
  trigger?: React.ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="link" size="sm">
            f172
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Form 172: Net Operating Losses (NOLs)
            {taxYear ? ` for ${taxYear}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto p-2">
          <Form172View data={data} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
