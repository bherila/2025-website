'use client'

import { FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { Form1116Lines } from '@/types/finance/tax-return'

export interface Schedule3Lines {
  partI: {
    line1_foreignTaxCredit: number
    line2_dependentCareCredit: number | null
    line3_educationCredits: number | null
    line4_retirementSavingsCredit: number | null
    line5a_residentialCleanEnergy: number | null
    line5b_energyEfficientHome: number | null
    line6_otherCredits: number | null
    line7_total: number
  }
  partII: {
    line9_extensionPayment: number | null
    line10_excessSSWithheld: number | null
    line11_fuelTaxCredit: number | null
    line13_total: number
  }
}

export function computeSchedule3({ form1116 }: { form1116?: Form1116Lines | undefined }): Schedule3Lines {
  const ftc = form1116?.totalForeignTaxes ?? 0
  const partI: Schedule3Lines['partI'] = {
    line1_foreignTaxCredit: ftc,
    line2_dependentCareCredit: null,
    line3_educationCredits: null,
    line4_retirementSavingsCredit: null,
    line5a_residentialCleanEnergy: null,
    line5b_energyEfficientHome: null,
    line6_otherCredits: null,
    line7_total: ftc,
  }
  const partII: Schedule3Lines['partII'] = {
    line9_extensionPayment: null,
    line10_excessSSWithheld: null,
    line11_fuelTaxCredit: null,
    line13_total: 0,
  }
  return { partI, partII }
}

interface Schedule3PreviewProps {
  schedule3: Schedule3Lines
  selectedYear: number
}

export default function Schedule3Preview({ schedule3, selectedYear }: Schedule3PreviewProps) {
  const { partI, partII } = schedule3
  return (
    <div className="space-y-6">
      <FormBlock title={`Schedule 3 — Additional Credits & Payments (${selectedYear})`}>
        <p className="text-xs text-muted-foreground">
          Most Schedule 3 lines (dependent-care credit, education credits, retirement savings credit, energy
          credits) aren&apos;t implemented yet. Currently only line 1 (Foreign Tax Credit from Form 1116) is wired.
        </p>
      </FormBlock>

      <FormBlock title="Part I — Nonrefundable Credits">
        <FormLine boxRef="1" label="Foreign tax credit (Form 1116)" value={partI.line1_foreignTaxCredit} />
        <FormLine boxRef="2" label="Credit for child and dependent care expenses (Form 2441)" value={partI.line2_dependentCareCredit} />
        <FormLine boxRef="3" label="Education credits (Form 8863)" value={partI.line3_educationCredits} />
        <FormLine boxRef="4" label="Retirement savings contributions credit (Form 8880)" value={partI.line4_retirementSavingsCredit} />
        <FormLine boxRef="5a" label="Residential clean energy credit (Form 5695)" value={partI.line5a_residentialCleanEnergy} />
        <FormLine boxRef="5b" label="Energy efficient home improvement credit (Form 5695)" value={partI.line5b_energyEfficientHome} />
        <FormLine boxRef="6" label="Other credits" value={partI.line6_otherCredits} />
        <FormTotalLine label="Line 7 — Total nonrefundable credits → Form 1040 line 20" value={partI.line7_total} />
      </FormBlock>

      <FormBlock title="Part II — Other Payments & Refundable Credits">
        <FormLine boxRef="9" label="Amount paid with extension request" value={partII.line9_extensionPayment} />
        <FormLine boxRef="10" label="Excess Social Security tax withheld" value={partII.line10_excessSSWithheld} />
        <FormLine boxRef="11" label="Credit for federal tax on fuels (Form 4136)" value={partII.line11_fuelTaxCredit} />
        <FormTotalLine label="Line 13 — Total → Form 1040 line 31" value={partII.line13_total} />
      </FormBlock>
    </div>
  )
}
