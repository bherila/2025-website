import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatFriendlyAmount } from '@/lib/formatCurrency'
import { Button } from '@/components/ui/button'
import { ExcessBusinessLossLimitation } from '@/lib/tax/ExcessBusinessLossLimitation'
import type { ScheduleDData } from '@/lib/tax/scheduleD'

export interface Form461Data {
  // Part I
  f461_line2: number // Schedule 1 (Form 1040), line 3
  f461_line3: number // Form 1040, line 7
  f461_line4: number // Schedule 1 (Form 1040), line 4
  f461_line5: number // Schedule 1 (Form 1040), line 5
  f461_line6: number // Schedule 1 (Form 1040), line 6
  f461_line8: number // Other trade/business income/gain/loss
  f461_line9: number // Combine lines 1-8
  // Part II
  f461_line10: number // Income/gain not attributable to trade/business
  f461_line11: number // Losses/deductions not attributable to trade/business
  f461_line12: number // Subtract line 11 from line 10
  // Part III
  f461_line13: number // If line 12 negative, enter as positive; if positive, enter as negative
  f461_line14: number // Add lines 9 and 13
  f461_line15: number // Maximum excess business loss (threshold)
  f461_line16: number // Add lines 14 and 15
}

export function form461({
  taxYear,
  isSingle,
  schedule1_line3 = 0,
  scheduleDData,
  schedule1_line4 = 0,
  schedule1_line5 = 0,
  schedule1_line6 = 0,
  f461_line8 = 0,
  f461_line11 = 0,
  override_f461_line15 = null,
  // Legacy parameters for backward compatibility
  f1040_line7,
  businessCapGains,
  nonBusinessCapGains,
}: {
  taxYear: number
  isSingle: boolean
  schedule1_line3?: number
  scheduleDData?: ScheduleDData // Preferred: Schedule D data with business/personal breakdown
  schedule1_line4?: number
  schedule1_line5?: number
  schedule1_line6?: number
  f461_line8?: number
  f461_line11?: number
  override_f461_line15: number | null
  // Legacy parameters for backward compatibility
  f1040_line7?: number
  businessCapGains?: number
  nonBusinessCapGains?: number
}): Form461Data {
  const f461_line15 = override_f461_line15 ?? ExcessBusinessLossLimitation({ taxYear, isSingle })

  // Lines 1 and 7 are reserved for future use (blank)
  const f461_line2 = schedule1_line3

  // Determine capital gains amounts to use
  let f461_line3: number
  let nonBusinessPortionOfCapGains: number

  if (scheduleDData) {
    // Use the new Schedule D data (preferred)
    f461_line3 = scheduleDData.schD_line21 // LIMITED amount from Schedule D
    nonBusinessPortionOfCapGains = scheduleDData.limitedPersonalCapGains
  } else if (f1040_line7 !== undefined) {
    // Use the LIMITED amount from Form 1040 line 7 (legacy)
    f461_line3 = f1040_line7

    // Calculate the non-business portion of the capital gains
    // If f1040_line7 is negative (loss), all of it is non-business since business gains would be positive
    // If f1040_line7 is positive, we need to separate business from non-business portions
    nonBusinessPortionOfCapGains = f1040_line7 < 0 ? f1040_line7 : Math.min(f1040_line7, nonBusinessCapGains || 0)
  } else {
    // Backward compatibility: use raw amounts
    f461_line3 = (nonBusinessCapGains || 0) + (businessCapGains || 0)
    nonBusinessPortionOfCapGains = nonBusinessCapGains || 0
  }

  const f461_line4 = schedule1_line4
  const f461_line5 = schedule1_line5
  const f461_line6 = schedule1_line6
  // ...existing code...
  const f461_line9 = f461_line2 + f461_line3 + f461_line4 + f461_line5 + f461_line6 + f461_line8

  const f461_line10 = nonBusinessPortionOfCapGains // Income/gain reported not attributable to a trade or business
  const f461_line12 = f461_line10 - f461_line11
  const f461_line13 = f461_line12 < 0 ? Math.abs(f461_line12) : -Math.abs(f461_line12)
  const f461_line14 = f461_line9 + f461_line13
  const f461_line16 = Math.abs(Math.min(0, f461_line14 + f461_line15))

  return {
    f461_line2,
    f461_line3,
    f461_line4,
    f461_line5,
    f461_line6,
    f461_line8,
    f461_line9,
    f461_line10,
    f461_line11,
    f461_line12,
    f461_line13,
    f461_line14,
    f461_line15,
    f461_line16,
  }
}

type LineKey = keyof Form461Data
interface LineDef {
  key: LineKey
  label: string
}

const lines: LineDef[] = [
  { key: 'f461_line2', label: '2. Schedule 1 (Form 1040), line 3' },
  { key: 'f461_line3', label: '3. Form 1040, line 7' },
  { key: 'f461_line4', label: '4. Schedule 1 (Form 1040), line 4' },
  { key: 'f461_line5', label: '5. Schedule 1 (Form 1040), line 5' },
  { key: 'f461_line6', label: '6. Schedule 1 (Form 1040), line 6' },
  { key: 'f461_line8', label: '8. Other trade/business income/gain/loss' },
  { key: 'f461_line9', label: '9. Combine lines 1-8' },
  { key: 'f461_line10', label: '10. Enter income/gain reported on lines 1-8 not attributable to a trade or business.' },
  {
    key: 'f461_line11',
    label: '11. Enter losses/deductions reported on lines 1-8 not attributable to a trade or business.',
  },
  { key: 'f461_line12', label: '12. Subtract line 11 from line 10' },
  { key: 'f461_line13', label: '13. If line 12 negative, enter as positive; if positive, enter as negative' },
  { key: 'f461_line14', label: '14. Add lines 9 and 13' },
  { key: 'f461_line15', label: '15. Maximum excess business loss (threshold)' },
  {
    key: 'f461_line16',
    label:
      '16. Add lines 14 and 15. If less than zero, enter the amount from line 16 as a positive number on Schedule 1 (Form 1040), line 8p.',
  },
]
// ...existing code...

export function Form461View({ data }: { data: Form461Data }) {
  const nonZeroLines = lines.filter((line) => data[line.key] !== undefined)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Line</TableHead>
          <TableHead>Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {nonZeroLines.map((line) => (
          <TableRow key={line.key}>
            <TableCell>{line.label}</TableCell>
            <TableCell>{formatFriendlyAmount(data[line.key])}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function DialogForm461View({ data, trigger }: { data: Form461Data; trigger?: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="link" size="sm">
            f461
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Form 461 Details</DialogTitle>
        </DialogHeader>
        <Form461View data={data} />
      </DialogContent>
    </Dialog>
  )
}
