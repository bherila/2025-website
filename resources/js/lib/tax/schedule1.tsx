import React from 'react'
import { formatFriendlyAmount } from '@/lib/formatCurrency'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import type { Form461Data } from '@/lib/tax/form461'
import { Form461View, form461, DialogForm461View } from '@/lib/tax/form461'
import type { ScheduleDData } from '@/lib/tax/scheduleD'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface Schedule1Data {
  sch1_line3: number
  sch1_line4: number
  sch1_line5: number
  sch1_line6: number
  sch1_line7: number
  sch1_line8a: number
  sch1_line8p: number
  sch1_line9: number
  sch1_line10: number
  sch1_line15: number
  sch1_line16: number
  sch1_line17: number
  sch1_line18: number
  sch1_line25: number
  sch1_line26: number
  form461output?: Form461Data
}

export function schedule1({
  scheduleDData,
  businessIncome = 0,
  otherGains = 0,
  rentalIncome = 0,
  farmIncome = 0,
  netOperatingLoss,
  selfEmploymentTax = 0,
  sepSimpleQualifiedPlans = 0,
  selfEmployedHealthInsurance = 0,
  earlyWithdrawalPenalty = 0,
  taxYear,
  isSingle,
  override_f461_line15 = null,
}: {
  scheduleDData?: ScheduleDData // Schedule D data with business/personal capital gains breakdown
  businessIncome?: number
  otherGains?: number
  rentalIncome?: number
  farmIncome?: number
  netOperatingLoss: number
  selfEmploymentTax?: number
  sepSimpleQualifiedPlans?: number
  selfEmployedHealthInsurance?: number
  earlyWithdrawalPenalty?: number
  taxYear: number
  isSingle: boolean
  override_f461_line15: number | null // Optional override for the maximum excess business loss
}): Schedule1Data {
  const form461output = form461({
    taxYear,
    isSingle,
    schedule1_line3: businessIncome,
    schedule1_line4: otherGains,
    schedule1_line5: rentalIncome,
    schedule1_line6: farmIncome,
    f461_line8: 0, // Other trade/business income
    f461_line11: 0, // Not used in this context
    override_f461_line15,
    ...(scheduleDData && { scheduleDData }), // Conditionally include scheduleDData only if defined
  })
  // sch1_line8p is calculated from form461 f461_line16
  const res = {
    sch1_line3: businessIncome, // Business income or (loss)
    sch1_line4: otherGains, // Other gains or (losses)
    sch1_line5: rentalIncome, // Rental real estate, royalties, partnerships, S corporations, trusts, etc.
    sch1_line6: farmIncome, // Farm income or (loss)
    sch1_line7: 0, // Unemployment income (not used in this context)
    sch1_line8a: -netOperatingLoss, // Net operating loss deduction
    sch1_line8p: form461output.f461_line16, // Section 461(l) excess business loss adjustment
    sch1_line9: 0, // Total other income
    sch1_line10: 0, // Additional income total Enter here and on Form 1040, 1040-SR, or 1040-NR, line 8
    sch1_line15: selfEmploymentTax, // Deductible part of self-employment tax
    sch1_line16: sepSimpleQualifiedPlans, // Self-employed SEP, SIMPLE, and qualified plans
    sch1_line17: selfEmployedHealthInsurance, // Self-employed health insurance deduction
    sch1_line18: earlyWithdrawalPenalty, // Penalty on early withdrawal of savings
    sch1_line25: 0, // Total other adjustments (Add lines 24a through 24z)
    sch1_line26: 0, // Adjustments to income total
    form461output: form461output, // Include the form461 output if needed
  }

  // 9. Total other income. Add lines 8a through 8z
  res.sch1_line9 = res.sch1_line8a + res.sch1_line8p

  // 10. Combine lines 1 through 7 and 9. This is your additional income.
  res.sch1_line10 = res.sch1_line3 + res.sch1_line4 + res.sch1_line5 + res.sch1_line6 + res.sch1_line7 + res.sch1_line9

  // Add lines 11 through 23 and 25 for adjustments to income total.
  // Enter here and on Form 1040, 1040-SR, or 1040-NR, line 10
  // For now, assume these lines are zero or not provided in the function arguments
  // You can add more arguments to the function if you need to populate these lines
  let adjustments =
    0 + // line 11
    0 + // line 12
    0 + // line 13
    0 + // line 14
    (res.sch1_line15 || 0) + // line 15
    (res.sch1_line16 || 0) + // line 16
    (res.sch1_line17 || 0) + // line 17
    (res.sch1_line18 || 0) + // line 18
    0 + // line 19
    0 + // line 20
    0 + // line 21
    0 + // line 22
    0 + // line 23
    (res.sch1_line25 || 0) // line 25

  res.sch1_line26 = adjustments
  return res
}

type LineKey = keyof Schedule1Data
interface LineDef {
  key: LineKey
  label: string
}

const lines: LineDef[] = [
  { key: 'sch1_line3', label: '3. Business income or (loss)' },
  { key: 'sch1_line4', label: '4. Other gains or (losses)' },
  { key: 'sch1_line5', label: '5. Rental real estate, royalties, partnerships, S corporations, trusts, etc.' },
  { key: 'sch1_line6', label: '6. Farm income or (loss)' },
  { key: 'sch1_line7', label: '7. Unemployment compensation' },
  { key: 'sch1_line8a', label: '8a. Net operating loss deduction' },
  { key: 'sch1_line8p', label: '8p. Section 461(l) excess business loss adjustment' },
  { key: 'sch1_line9', label: '9. Total other income' },
  { key: 'sch1_line10', label: '10. Additional income total. Enter here and on Form 1040, 1040-SR, or 1040-NR, line 8.' },
  { key: 'sch1_line15', label: '15. Deductible part of self-employment tax' },
  { key: 'sch1_line16', label: '16. Self-employed SEP, SIMPLE, and qualified plans' },
  { key: 'sch1_line17', label: '17. Self-employed health insurance deduction' },
  { key: 'sch1_line18', label: '18. Penalty on early withdrawal of savings' },
  { key: 'sch1_line25', label: '25. Total other adjustments' },
  {
    key: 'sch1_line26',
    label: '26. Adjustments to income total. Enter here and on Form 1040, 1040-SR, or 1040-NR, line 10.',
  },
]

export function Schedule1View({ data }: { data: Schedule1Data }) {
  const nonZeroLines = lines.filter((line) => data[line.key] !== 0)
  return (
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
            const rowValue = data[line.key]
            if (typeof rowValue !== 'number') {
              return null // Skip non-numeric values
            }
            return (
              <TableRow key={line.key}>
                <TableCell>{line.label}</TableCell>
                <TableCell>{formatFriendlyAmount(rowValue)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {data.form461output && (
        <div className="w-full">
          <hr />
          <div className="mt-4 font-semibold text-base">Form 461 details</div>
          <Form461View data={data.form461output} />
        </div>
      )}
    </>
  )
}

export function DialogSchedule1View({
  data,
  taxYear,
  trigger,
}: {
  data: Schedule1Data
  taxYear?: number
  trigger?: React.ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="link" size="sm">
            sch1
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule 1{taxYear ? ` for ${taxYear}` : ''}</DialogTitle>
        </DialogHeader>
        <Schedule1View data={data} />
      </DialogContent>
    </Dialog>
  )
}
