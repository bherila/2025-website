import React from 'react'
import { formatFriendlyAmount } from '@/lib/formatCurrency'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface ScheduleDData {
  // Part I - Short-Term Capital Gains and Losses
  schD_line1a_proceeds: number
  schD_line1a_cost: number
  schD_line1a_adjustments: number
  schD_line1a_gain_loss: number
  schD_line1b_proceeds: number
  schD_line1b_cost: number
  schD_line1b_adjustments: number
  schD_line1b_gain_loss: number
  schD_line2_proceeds: number
  schD_line2_cost: number
  schD_line2_adjustments: number
  schD_line2_gain_loss: number
  schD_line3_proceeds: number
  schD_line3_cost: number
  schD_line3_adjustments: number
  schD_line3_gain_loss: number
  schD_line4: number
  schD_line5: number
  schD_line6: number
  schD_line7: number // Net short-term capital gain or (loss)

  // Part II - Long-Term Capital Gains and Losses
  schD_line8a_proceeds: number
  schD_line8a_cost: number
  schD_line8a_adjustments: number
  schD_line8a_gain_loss: number
  schD_line8b_proceeds: number
  schD_line8b_cost: number
  schD_line8b_adjustments: number
  schD_line8b_gain_loss: number
  schD_line9_proceeds: number
  schD_line9_cost: number
  schD_line9_adjustments: number
  schD_line9_gain_loss: number
  schD_line10_proceeds: number
  schD_line10_cost: number
  schD_line10_adjustments: number
  schD_line10_gain_loss: number
  schD_line11: number
  schD_line12: number
  schD_line13: number
  schD_line14: number
  schD_line15: number // Net long-term capital gain or (loss)

  // Part III - Summary
  schD_line16: number // Combine lines 7 and 15
  schD_line21: number // Limited loss amount for Form 1040 line 7

  // Additional breakdown for Form 461 calculations
  totalBusinessCapGains: number // Total business capital gains (line 5 + line 12)
  totalPersonalCapGains: number // Total personal capital gains (everything else)
  limitedBusinessCapGains: number // Business portion of the limited amount
  limitedPersonalCapGains: number // Personal portion of the limited amount
}

export function scheduleD({
  // Short-term transactions
  line1a_gain_loss = 0, // Personal capital gains (short-term)
  line1b_gain_loss = 0,
  line2_gain_loss = 0,
  line3_gain_loss = 0,
  line4 = 0,
  line5 = 0, // Business capital gains (short-term)
  line6_carryover = 0,

  // Long-term transactions
  line8a_gain_loss = 0,
  line8b_gain_loss = 0,
  line9_gain_loss = 0,
  line10_gain_loss = 0,
  line11 = 0,
  line12 = 0,
  line13_capital_gain_distributions = 0,
  line14_carryover = 0,

  // Filing status for loss limitation
  isSingle = true,
}: {
  // Short-term
  line1a_gain_loss?: number
  line1b_gain_loss?: number
  line2_gain_loss?: number
  line3_gain_loss?: number
  line4?: number
  line5?: number
  line6_carryover?: number

  // Long-term
  line8a_gain_loss?: number
  line8b_gain_loss?: number
  line9_gain_loss?: number
  line10_gain_loss?: number
  line11?: number
  line12?: number
  line13_capital_gain_distributions?: number
  line14_carryover?: number

  // Filing status
  isSingle?: boolean
}): ScheduleDData {
  // Part I - Short-term calculations
  const line7 = line1a_gain_loss + line1b_gain_loss + line2_gain_loss + line3_gain_loss + line4 + line5 + line6_carryover

  // Part II - Long-term calculations
  const line15 =
    line8a_gain_loss +
    line8b_gain_loss +
    line9_gain_loss +
    line10_gain_loss +
    line11 +
    line12 +
    line13_capital_gain_distributions +
    line14_carryover

  // Part III - Summary
  const line16 = line7 + line15

  // Line 21 - Loss limitation
  const lossLimit = isSingle ? -3000 : -1500
  const line21 = line16 < 0 ? Math.max(line16, lossLimit) : line16

  // Calculate business vs personal breakdown
  const totalBusinessCapGains = line5 + line12 // Business gains from line 5 (short-term) and line 12 (long-term)
  const totalPersonalCapGains = line16 - totalBusinessCapGains // Everything else is personal

  // Calculate limited breakdown
  // If line21 equals line16, no limitation was applied
  // If limitation was applied, we need to proportionally reduce both business and personal
  let limitedBusinessCapGains: number
  let limitedPersonalCapGains: number

  if (line21 === line16) {
    // No limitation applied
    limitedBusinessCapGains = totalBusinessCapGains
    limitedPersonalCapGains = totalPersonalCapGains
  } else {
    // Limitation was applied, allocate proportionally
    if (line16 < 0) {
      // For losses, allocate the limited amount proportionally
      const businessRatio = line16 === 0 ? 0 : totalBusinessCapGains / line16
      const personalRatio = line16 === 0 ? 0 : totalPersonalCapGains / line16
      limitedBusinessCapGains = line21 * businessRatio
      limitedPersonalCapGains = line21 * personalRatio
    } else {
      // For gains, no limitation
      limitedBusinessCapGains = totalBusinessCapGains
      limitedPersonalCapGains = totalPersonalCapGains
    }
  }

  return {
    // Part I - Short-term (simplified - we only track gain/loss for display)
    schD_line1a_proceeds: 0,
    schD_line1a_cost: 0,
    schD_line1a_adjustments: 0,
    schD_line1a_gain_loss: line1a_gain_loss,
    schD_line1b_proceeds: 0,
    schD_line1b_cost: 0,
    schD_line1b_adjustments: 0,
    schD_line1b_gain_loss: line1b_gain_loss,
    schD_line2_proceeds: 0,
    schD_line2_cost: 0,
    schD_line2_adjustments: 0,
    schD_line2_gain_loss: line2_gain_loss,
    schD_line3_proceeds: 0,
    schD_line3_cost: 0,
    schD_line3_adjustments: 0,
    schD_line3_gain_loss: line3_gain_loss,
    schD_line4: line4,
    schD_line5: line5,
    schD_line6: line6_carryover,
    schD_line7: line7,

    // Part II - Long-term (simplified)
    schD_line8a_proceeds: 0,
    schD_line8a_cost: 0,
    schD_line8a_adjustments: 0,
    schD_line8a_gain_loss: line8a_gain_loss,
    schD_line8b_proceeds: 0,
    schD_line8b_cost: 0,
    schD_line8b_adjustments: 0,
    schD_line8b_gain_loss: line8b_gain_loss,
    schD_line9_proceeds: 0,
    schD_line9_cost: 0,
    schD_line9_adjustments: 0,
    schD_line9_gain_loss: line9_gain_loss,
    schD_line10_proceeds: 0,
    schD_line10_cost: 0,
    schD_line10_adjustments: 0,
    schD_line10_gain_loss: line10_gain_loss,
    schD_line11: line11,
    schD_line12: line12,
    schD_line13: line13_capital_gain_distributions,
    schD_line14: line14_carryover,
    schD_line15: line15,

    // Part III - Summary
    schD_line16: line16,
    schD_line21: line21,

    // Additional breakdown for Form 461 calculations
    totalBusinessCapGains,
    totalPersonalCapGains,
    limitedBusinessCapGains,
    limitedPersonalCapGains,
  }
}

interface ScheduleDLineDef {
  key: keyof ScheduleDData
  label: string
  isSubtotal?: boolean
  isTotal?: boolean
}

const shortTermLines: ScheduleDLineDef[] = [
  { key: 'schD_line1a_gain_loss', label: '1a. Personal capital gains/losses (basis reported to IRS)' },
  { key: 'schD_line1b_gain_loss', label: '1b. Transactions reported on Form 8949 (Box A)' },
  { key: 'schD_line2_gain_loss', label: '2. Transactions reported on Form 8949 (Box B)' },
  { key: 'schD_line3_gain_loss', label: '3. Transactions reported on Form 8949 (Box C)' },
  { key: 'schD_line4', label: '4. Short-term gain from Form 6252 and other forms' },
  { key: 'schD_line5', label: '5. Business capital gains/losses from partnerships, S corps, etc.' },
  { key: 'schD_line6', label: '6. Short-term capital loss carryover' },
  { key: 'schD_line7', label: '7. Net short-term capital gain or (loss)', isSubtotal: true },
]

const longTermLines: ScheduleDLineDef[] = [
  { key: 'schD_line8a_gain_loss', label: '8a. Long-term transactions (basis reported to IRS)' },
  { key: 'schD_line8b_gain_loss', label: '8b. Transactions reported on Form 8949 (Box D)' },
  { key: 'schD_line9_gain_loss', label: '9. Transactions reported on Form 8949 (Box E)' },
  { key: 'schD_line10_gain_loss', label: '10. Transactions reported on Form 8949 (Box F)' },
  { key: 'schD_line11', label: '11. Gain from Form 4797 and other long-term gains' },
  { key: 'schD_line12', label: '12. Net long-term gain from partnerships, S corps, etc.' },
  { key: 'schD_line13', label: '13. Capital gain distributions' },
  { key: 'schD_line14', label: '14. Long-term capital loss carryover' },
  { key: 'schD_line15', label: '15. Net long-term capital gain or (loss)', isSubtotal: true },
]

const summaryLines: ScheduleDLineDef[] = [
  { key: 'schD_line16', label: '16. Combine lines 7 and 15', isTotal: true },
  { key: 'schD_line21', label: '21. Capital gain/loss for Form 1040 line 7 (limited)', isTotal: true },
]

export function ScheduleDView({ data }: { data: ScheduleDData }) {
  const renderSection = (lines: ScheduleDLineDef[], title: string) => {
    const nonZeroLines = lines.filter((line) => data[line.key] !== 0)
    if (nonZeroLines.length === 0) return null

    return (
      <>
        <div className="font-semibold text-sm mt-4 mb-2">{title}</div>
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
                <TableRow key={line.key} className={line.isSubtotal || line.isTotal ? 'font-semibold' : ''}>
                  <TableCell>{line.label}</TableCell>
                  <TableCell>{formatFriendlyAmount(value)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </>
    )
  }

  return (
    <>
      {renderSection(shortTermLines, 'Part I — Short-Term Capital Gains and Losses')}
      {renderSection(longTermLines, 'Part II — Long-Term Capital Gains and Losses')}
      {renderSection(summaryLines, 'Part III — Summary')}
    </>
  )
}

export function DialogScheduleDView({
  data,
  taxYear,
  trigger,
}: {
  data: ScheduleDData
  taxYear?: number
  trigger?: React.ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="link" size="sm">
            schD
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Schedule D{taxYear ? ` for ${taxYear}` : ''}</DialogTitle>
        </DialogHeader>
        <ScheduleDView data={data} />
      </DialogContent>
    </Dialog>
  )
}
