'use client'

import { FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { Form1116Lines } from '@/types/finance/tax-return'
import type { Schedule3Facts } from '@/types/generated/tax-preview-facts'

export interface Schedule3Lines {
  partI: {
    line1_foreignTaxCredit: number
    line2_dependentCareCredit: number | null
    line3_educationCredits: number | null
    line4_retirementSavingsCredit: number | null
    line5a_residentialCleanEnergy: number | null
    line5b_energyEfficientHome: number | null
    line7_otherCredits: number
    line8_total: number
  }
  partII: {
    line9_netPremiumTaxCredit: number
    line10_extensionPayment: number
    line11_excessSSWithheld: number
    line12_fuelTaxCredit: number
    line14_otherPayments: number
    line15_total: number
  }
}

export function computeSchedule3({
  form1116,
  taxFacts,
}: {
  form1116?: Form1116Lines | undefined
  taxFacts?: Schedule3Facts | null
}): Schedule3Lines {
  if (taxFacts) {
    return {
      partI: {
        line1_foreignTaxCredit: taxFacts.line1ForeignTaxCredit,
        line2_dependentCareCredit: taxFacts.line2ChildDependentCareCredit,
        line3_educationCredits: taxFacts.line3EducationCredits,
        line4_retirementSavingsCredit: taxFacts.line4RetirementSavingsCredit,
        line5a_residentialCleanEnergy: taxFacts.line5aResidentialCleanEnergyCredit,
        line5b_energyEfficientHome: taxFacts.line5bEnergyEfficientHomeImprovementCredit,
        line7_otherCredits: taxFacts.line7OtherNonrefundableCredits,
        line8_total: taxFacts.line8TotalNonrefundableCredits,
      },
      partII: {
        line9_netPremiumTaxCredit: taxFacts.line9NetPremiumTaxCredit,
        line10_extensionPayment: taxFacts.line10ExtensionPayment,
        line11_excessSSWithheld: taxFacts.line11ExcessSocialSecurityWithheld,
        line12_fuelTaxCredit: taxFacts.line12FuelTaxCredit,
        line14_otherPayments: taxFacts.line14OtherPaymentsRefundableCredits,
        line15_total: taxFacts.line15TotalPaymentsRefundableCredits,
      },
    }
  }

  const ftc = form1116?.totalForeignTaxes ?? 0
  const partI: Schedule3Lines['partI'] = {
    line1_foreignTaxCredit: ftc,
    line2_dependentCareCredit: 0,
    line3_educationCredits: 0,
    line4_retirementSavingsCredit: 0,
    line5a_residentialCleanEnergy: 0,
    line5b_energyEfficientHome: 0,
    line7_otherCredits: 0,
    line8_total: ftc,
  }
  const partII: Schedule3Lines['partII'] = {
    line9_netPremiumTaxCredit: 0,
    line10_extensionPayment: 0,
    line11_excessSSWithheld: 0,
    line12_fuelTaxCredit: 0,
    line14_otherPayments: 0,
    line15_total: 0,
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
          Backend facts combine Form 1116 and user-entered Schedule 3 credit/payment inputs.
        </p>
      </FormBlock>

      <FormBlock title="Part I — Nonrefundable Credits">
        <FormLine boxRef="1" label="Foreign tax credit (Form 1116)" value={partI.line1_foreignTaxCredit} />
        <FormLine boxRef="2" label="Credit for child and dependent care expenses (Form 2441)" value={partI.line2_dependentCareCredit} />
        <FormLine boxRef="3" label="Education credits (Form 8863)" value={partI.line3_educationCredits} />
        <FormLine boxRef="4" label="Retirement savings contributions credit (Form 8880)" value={partI.line4_retirementSavingsCredit} />
        <FormLine boxRef="5a" label="Residential clean energy credit (Form 5695)" value={partI.line5a_residentialCleanEnergy} />
        <FormLine boxRef="5b" label="Energy efficient home improvement credit (Form 5695)" value={partI.line5b_energyEfficientHome} />
        <FormLine boxRef="7" label="Total other nonrefundable credits" value={partI.line7_otherCredits} />
        <FormTotalLine boxRef="8" label="Total nonrefundable credits → Form 1040 line 20" value={partI.line8_total} />
      </FormBlock>

      <FormBlock title="Part II — Other Payments & Refundable Credits">
        <FormLine boxRef="9" label="Net premium tax credit (Form 8962)" value={partII.line9_netPremiumTaxCredit} />
        <FormLine boxRef="10" label="Amount paid with extension request" value={partII.line10_extensionPayment} />
        <FormLine boxRef="11" label="Excess Social Security tax withheld" value={partII.line11_excessSSWithheld} />
        <FormLine boxRef="12" label="Credit for federal tax on fuels (Form 4136)" value={partII.line12_fuelTaxCredit} />
        <FormLine boxRef="14" label="Total other payments or refundable credits" value={partII.line14_otherPayments} />
        <FormTotalLine boxRef="15" label="Total → Form 1040 line 31" value={partII.line15_total} />
      </FormBlock>
    </div>
  )
}
