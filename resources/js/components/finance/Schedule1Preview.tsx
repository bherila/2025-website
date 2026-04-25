'use client'

import currency from 'currency.js'

import { FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { Schedule1Lines } from '@/types/finance/tax-return'

interface Schedule1PreviewProps {
  selectedYear: number
  schedule1?: Schedule1Lines | undefined
}

export function computeSchedule1Totals({
  scheduleCNetIncome = 0,
  scheduleEGrandTotal = 0,
  schedule1OtherIncome = 0,
  deductibleSeTaxAdjustment = 0,
}: {
  scheduleCNetIncome?: number
  scheduleEGrandTotal?: number
  schedule1OtherIncome?: number
  deductibleSeTaxAdjustment?: number
}): Schedule1Lines {
  const line9_totalOther = currency(schedule1OtherIncome).value
  const line10_total = currency(scheduleCNetIncome)
    .add(scheduleEGrandTotal)
    .add(line9_totalOther).value
  const line15_deductibleSeTax = deductibleSeTaxAdjustment === 0
    ? null
    : currency(deductibleSeTaxAdjustment).value

  return {
    partI: {
      line1a_taxableRefunds: null,
      line2a_alimonyReceived: null,
      line3_business: scheduleCNetIncome,
      line4_otherGains: null,
      line5_rentalPartnerships: scheduleEGrandTotal,
      line6_farmIncome: null,
      line7_unemploymentCompensation: null,
      line8z_otherIncome: schedule1OtherIncome,
      line9_totalOther,
      line10_total,
    },
    partII: {
      line13_hsaDeduction: null,
      line15_deductibleSeTax,
      line17_selfEmployedHealthInsurance: null,
      line20_iraDeduction: null,
      line21_studentLoanInterest: null,
      line26_totalAdjustments: currency(line15_deductibleSeTax ?? 0).value,
    },
  }
}

export default function Schedule1Preview({
  selectedYear,
  schedule1,
}: Schedule1PreviewProps) {
  const totals = schedule1 ?? computeSchedule1Totals({})

  const hasAnyIncome = totals.partI.line10_total !== 0

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold mb-0.5">Schedule 1 — {selectedYear}</h3>
        <p className="text-xs text-muted-foreground">
          Additional Income and Adjustments to Income — Part I (Additional Income) feeds Form 1040 line 8
        </p>
      </div>

      {!hasAnyIncome && (
        <p className="text-sm text-muted-foreground">No Schedule 1 Part I income for this year.</p>
      )}

      {hasAnyIncome && (
        <FormBlock title="Part I — Additional Income">
          {totals.partI.line3_business !== 0 && (
            <>
              <FormLine boxRef="3" label="Business income or (loss)" value={totals.partI.line3_business} />
              <FormSubLine text="From Schedule C net income" />
            </>
          )}
          {totals.partI.line5_rentalPartnerships !== 0 && (
            <>
              <FormLine
                boxRef="5"
                label="Rental real estate, royalties, partnerships, S corporations, trusts"
                value={totals.partI.line5_rentalPartnerships}
              />
              <FormSubLine text="From Schedule E combined total" />
            </>
          )}
          {totals.partI.line8z_otherIncome !== 0 && (
            <>
              <FormLine boxRef="8z" label="Other income" value={totals.partI.line8z_otherIncome} />
              <FormSubLine text="From reviewed 1099-MISC documents routed to Schedule 1 line 8" />
              <FormTotalLine label="Line 9 — Total other income (sum of lines 8a-8z)" value={totals.partI.line9_totalOther} />
            </>
          )}
          <FormTotalLine
            label="Line 10 — Total additional income (to Form 1040 line 8)"
            value={totals.partI.line10_total}
            double
          />
        </FormBlock>
      )}

      <FormBlock title="Part II — Adjustments to Income">
        <FormLine
          boxRef="13"
          label="Health savings account (HSA) deduction"
          raw="—"
        />
        <FormLine
          boxRef="15"
          label="Deductible part of self-employment tax"
          value={totals.partII.line15_deductibleSeTax}
        />
        <FormSubLine text="Computed from Schedule SE and included in Form 1040 line 10." />
        <FormLine
          boxRef="17"
          label="Self-employed health insurance deduction"
          raw="—"
        />
        <FormLine
          boxRef="20"
          label="IRA deduction"
          raw="—"
        />
        <FormLine
          boxRef="21"
          label="Student loan interest deduction"
          raw="—"
        />
        <FormSubLine text="Additional Part II manual-entry lines are not yet tracked in the tax preview UI." />
        <FormTotalLine
          label="Line 26 — Total adjustments to income (to Form 1040 line 10)"
          value={totals.partII.line26_totalAdjustments}
          double
        />
      </FormBlock>
    </div>
  )
}
