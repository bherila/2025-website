'use client'

import currency from 'currency.js'

import { FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'

interface Schedule1PreviewProps {
  selectedYear: number
  scheduleCNetIncome: number
  scheduleEGrandTotal: number
  schedule1OtherIncome: number
}

export interface Schedule1Totals {
  line3_business: number
  line5_rentalPartnerships: number
  line8z_otherIncome: number
  line9_totalOther: number
  line10_total: number
}

export function computeSchedule1Totals({
  scheduleCNetIncome,
  scheduleEGrandTotal,
  schedule1OtherIncome,
}: {
  scheduleCNetIncome: number
  scheduleEGrandTotal: number
  schedule1OtherIncome: number
}): Schedule1Totals {
  const line9_totalOther = currency(schedule1OtherIncome).value
  const line10_total = currency(scheduleCNetIncome)
    .add(scheduleEGrandTotal)
    .add(line9_totalOther).value

  return {
    line3_business: scheduleCNetIncome,
    line5_rentalPartnerships: scheduleEGrandTotal,
    line8z_otherIncome: schedule1OtherIncome,
    line9_totalOther,
    line10_total,
  }
}

export default function Schedule1Preview({
  selectedYear,
  scheduleCNetIncome,
  scheduleEGrandTotal,
  schedule1OtherIncome,
}: Schedule1PreviewProps) {
  const totals = computeSchedule1Totals({ scheduleCNetIncome, scheduleEGrandTotal, schedule1OtherIncome })

  const hasAnyIncome = totals.line10_total !== 0

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
          {totals.line3_business !== 0 && (
            <>
              <FormLine boxRef="3" label="Business income or (loss)" value={totals.line3_business} />
              <FormSubLine text="From Schedule C net income" />
            </>
          )}
          {totals.line5_rentalPartnerships !== 0 && (
            <>
              <FormLine
                boxRef="5"
                label="Rental real estate, royalties, partnerships, S corporations, trusts"
                value={totals.line5_rentalPartnerships}
              />
              <FormSubLine text="From Schedule E combined total" />
            </>
          )}
          {totals.line8z_otherIncome !== 0 && (
            <>
              <FormLine boxRef="8z" label="Other income" value={totals.line8z_otherIncome} />
              <FormSubLine text="From reviewed 1099-MISC documents routed to Schedule 1 line 8" />
              <FormTotalLine label="Line 9 — Total other income (sum of lines 8a-8z)" value={totals.line9_totalOther} />
            </>
          )}
          <FormTotalLine
            label="Line 10 — Total additional income (to Form 1040 line 8)"
            value={totals.line10_total}
            double
          />
        </FormBlock>
      )}

      <FormBlock title="Part II — Adjustments to Income (not yet tracked)">
        <FormLine
          label="Deductible SE tax, HSA deduction, self-employed health insurance, IRA, student loan interest, etc."
          raw="—"
        />
        <FormSubLine text="Schedule 1 Part II is the target of a future milestone; today these reduce AGI elsewhere in the tool." />
      </FormBlock>
    </div>
  )
}
