'use client'

import currency from 'currency.js'

import { FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { Schedule1Lines } from '@/types/finance/tax-return'

interface Schedule1PreviewProps {
  selectedYear: number
  schedule1?: Schedule1Lines | undefined
}

export interface Schedule1Line8Breakdown {
  line8b: number
  line8h: number
  line8i: number
  line8z: number
}

export function computeSchedule1Totals({
  scheduleCNetIncome = 0,
  scheduleEGrandTotal = 0,
  schedule1OtherIncome = 0,
  schedule1Line8Breakdown,
  schedule1Line7Unemployment = 0,
  schedule1Line1aTaxableRefunds = 0,
  deductibleSeTaxAdjustment = 0,
}: {
  scheduleCNetIncome?: number
  scheduleEGrandTotal?: number
  /** @deprecated Pass schedule1Line8Breakdown for sub-line accuracy; falls back to line 8z. */
  schedule1OtherIncome?: number
  schedule1Line8Breakdown?: Schedule1Line8Breakdown
  schedule1Line7Unemployment?: number
  schedule1Line1aTaxableRefunds?: number
  deductibleSeTaxAdjustment?: number
}): Schedule1Lines {
  const line8b = schedule1Line8Breakdown?.line8b ?? 0
  const line8h = schedule1Line8Breakdown?.line8h ?? 0
  const line8i = schedule1Line8Breakdown?.line8i ?? 0
  const line8z = schedule1Line8Breakdown
    ? (schedule1Line8Breakdown.line8z ?? 0)
    : schedule1OtherIncome

  const line9_totalOther = currency(line8b).add(line8h).add(line8i).add(line8z).value
  const line10_total = currency(scheduleCNetIncome)
    .add(scheduleEGrandTotal)
    .add(schedule1Line1aTaxableRefunds)
    .add(schedule1Line7Unemployment)
    .add(line9_totalOther).value
  const line15_deductibleSeTax = deductibleSeTaxAdjustment === 0
    ? null
    : currency(deductibleSeTaxAdjustment).value

  return {
    partI: {
      line1a_taxableRefunds: schedule1Line1aTaxableRefunds === 0 ? null : schedule1Line1aTaxableRefunds,
      line2a_alimonyReceived: null,
      line3_business: scheduleCNetIncome,
      line4_otherGains: null,
      line5_rentalPartnerships: scheduleEGrandTotal,
      line6_farmIncome: null,
      line7_unemploymentCompensation: schedule1Line7Unemployment === 0 ? null : schedule1Line7Unemployment,
      line8b_gambling: line8b === 0 ? null : line8b,
      line8h_juryDuty: line8h === 0 ? null : line8h,
      line8i_prizes: line8i === 0 ? null : line8i,
      line8z_otherIncome: line8z,
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
          {totals.partI.line1a_taxableRefunds != null && totals.partI.line1a_taxableRefunds !== 0 && (
            <>
              <FormLine boxRef="1a" label="Taxable refunds, credits, or offsets of state and local income taxes" value={totals.partI.line1a_taxableRefunds} />
              <FormSubLine text="From 1099-G box 2" />
            </>
          )}
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
          {totals.partI.line7_unemploymentCompensation != null && totals.partI.line7_unemploymentCompensation !== 0 && (
            <>
              <FormLine boxRef="7" label="Unemployment compensation" value={totals.partI.line7_unemploymentCompensation} />
              <FormSubLine text="From 1099-G box 1" />
            </>
          )}
          {totals.partI.line8b_gambling != null && totals.partI.line8b_gambling !== 0 && (
            <>
              <FormLine boxRef="8b" label="Gambling winnings" value={totals.partI.line8b_gambling} />
              <FormSubLine text="From 1099-MISC routed to Schedule 1 line 8b" />
            </>
          )}
          {totals.partI.line8h_juryDuty != null && totals.partI.line8h_juryDuty !== 0 && (
            <>
              <FormLine boxRef="8h" label="Jury duty pay" value={totals.partI.line8h_juryDuty} />
              <FormSubLine text="From 1099-MISC routed to Schedule 1 line 8h" />
            </>
          )}
          {totals.partI.line8i_prizes != null && totals.partI.line8i_prizes !== 0 && (
            <>
              <FormLine boxRef="8i" label="Prizes and awards" value={totals.partI.line8i_prizes} />
              <FormSubLine text="From 1099-MISC routed to Schedule 1 line 8i" />
            </>
          )}
          {totals.partI.line8z_otherIncome !== 0 && (
            <>
              <FormLine boxRef="8z" label="Other income" value={totals.partI.line8z_otherIncome} />
              <FormSubLine text="From reviewed 1099-MISC documents routed to Schedule 1 line 8" />
            </>
          )}
          {totals.partI.line9_totalOther !== 0 && (
            <FormTotalLine label="Line 9 — Total other income (sum of lines 8a-8z)" value={totals.partI.line9_totalOther} />
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
