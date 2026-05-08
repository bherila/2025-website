'use client'

import { FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { Schedule3Facts } from '@/types/generated/tax-preview-facts'

interface Schedule3PreviewProps {
  facts: Schedule3Facts
  selectedYear: number
}

export default function Schedule3Preview({ facts, selectedYear }: Schedule3PreviewProps) {
  return (
    <div className="space-y-6">
      <FormBlock title={`Schedule 3 — Additional Credits & Payments (${selectedYear})`}>
        <p className="text-xs text-muted-foreground">
          Backend facts combine Form 1116 and user-entered Schedule 3 credit/payment inputs.
        </p>
      </FormBlock>

      <FormBlock title="Part I — Nonrefundable Credits">
        <FormLine boxRef="1" label="Foreign tax credit (Form 1116)" value={facts.line1ForeignTaxCredit} />
        <FormLine boxRef="2" label="Credit for child and dependent care expenses (Form 2441)" value={facts.line2ChildDependentCareCredit} />
        <FormLine boxRef="3" label="Education credits (Form 8863)" value={facts.line3EducationCredits} />
        <FormLine boxRef="4" label="Retirement savings contributions credit (Form 8880)" value={facts.line4RetirementSavingsCredit} />
        <FormLine boxRef="5a" label="Residential clean energy credit (Form 5695)" value={facts.line5aResidentialCleanEnergyCredit} />
        <FormLine boxRef="5b" label="Energy efficient home improvement credit (Form 5695)" value={facts.line5bEnergyEfficientHomeImprovementCredit} />
        <FormLine boxRef="7" label="Total other nonrefundable credits" value={facts.line7OtherNonrefundableCredits} />
        <FormTotalLine boxRef="8" label="Total nonrefundable credits → Form 1040 line 20" value={facts.line8TotalNonrefundableCredits} />
      </FormBlock>

      <FormBlock title="Part II — Other Payments & Refundable Credits">
        <FormLine boxRef="9" label="Net premium tax credit (Form 8962)" value={facts.line9NetPremiumTaxCredit} />
        <FormLine boxRef="10" label="Amount paid with extension request" value={facts.line10ExtensionPayment} />
        <FormLine boxRef="11" label="Excess Social Security tax withheld" value={facts.line11ExcessSocialSecurityWithheld} />
        <FormLine boxRef="12" label="Credit for federal tax on fuels (Form 4136)" value={facts.line12FuelTaxCredit} />
        <FormLine boxRef="14" label="Total other payments or refundable credits" value={facts.line14OtherPaymentsRefundableCredits} />
        <FormTotalLine boxRef="15" label="Total → Form 1040 line 31" value={facts.line15TotalPaymentsRefundableCredits} />
      </FormBlock>
    </div>
  )
}
