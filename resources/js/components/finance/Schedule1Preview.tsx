'use client'

import currency from 'currency.js'

import { type EmptyLine,EmptyLinesDisclosure } from '@/components/finance/EmptyLinesDisclosure'
import { FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { TAX_TABS, type TaxTabId } from '@/components/finance/tax-tab-ids'
import type { Schedule1Lines } from '@/types/finance/tax-return'

interface Schedule1PreviewProps {
  selectedYear: number
  schedule1?: Schedule1Lines | undefined
  /** Navigate to a source tab when the user clicks Go-to-source from the disclosure. */
  onTabChange?: (tab: TaxTabId) => void
  /** Inline manual-entry control for line 2a alimony (pre-2019 decrees). */
  line2aAlimonyInput?: React.ReactNode
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
  schedule1Line2aAlimony = 0,
  schedule1Line4OtherGains = 0,
  schedule1Line6FarmIncome = 0,
  deductibleSeTaxAdjustment = 0,
}: {
  scheduleCNetIncome?: number
  scheduleEGrandTotal?: number
  /** @deprecated Pass schedule1Line8Breakdown for sub-line accuracy; falls back to line 8z. */
  schedule1OtherIncome?: number
  schedule1Line8Breakdown?: Schedule1Line8Breakdown
  schedule1Line7Unemployment?: number
  schedule1Line1aTaxableRefunds?: number
  /** Alimony received from pre-2019 divorce decrees (user-entered). */
  schedule1Line2aAlimony?: number
  /** Net Part I result from Form 4797 (other gains/losses on business property). */
  schedule1Line4OtherGains?: number
  /** Net result from Schedule F (farm income/loss). */
  schedule1Line6FarmIncome?: number
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
    .add(schedule1Line2aAlimony)
    .add(schedule1Line4OtherGains)
    .add(schedule1Line6FarmIncome)
    .add(schedule1Line7Unemployment)
    .add(line9_totalOther).value
  const line15_deductibleSeTax = deductibleSeTaxAdjustment === 0
    ? null
    : currency(deductibleSeTaxAdjustment).value

  return {
    partI: {
      line1a_taxableRefunds: schedule1Line1aTaxableRefunds === 0 ? null : schedule1Line1aTaxableRefunds,
      line2a_alimonyReceived: schedule1Line2aAlimony === 0 ? null : schedule1Line2aAlimony,
      line3_business: scheduleCNetIncome,
      line4_otherGains: schedule1Line4OtherGains === 0 ? null : schedule1Line4OtherGains,
      line5_rentalPartnerships: scheduleEGrandTotal,
      line6_farmIncome: schedule1Line6FarmIncome === 0 ? null : schedule1Line6FarmIncome,
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

/**
 * A Part I line is "visible" when its value is a non-zero number. A `null`
 * value means the source form/document doesn't exist yet (structurally empty).
 * A `0` value means source data exists but nets to zero.
 */
function classifyPartIValue(value: number | null): 'visible' | 'null' | 'zero' {
  if (value === null) {
    return 'null'
  }
  return value === 0 ? 'zero' : 'visible'
}

export default function Schedule1Preview({
  selectedYear,
  schedule1,
  onTabChange,
  line2aAlimonyInput,
}: Schedule1PreviewProps) {
  const totals = schedule1 ?? computeSchedule1Totals({})
  const partI = totals.partI
  const partII = totals.partII

  const line1a = classifyPartIValue(partI.line1a_taxableRefunds)
  const line2a = classifyPartIValue(partI.line2a_alimonyReceived)
  const line3 = classifyPartIValue(partI.line3_business)
  const line4 = classifyPartIValue(partI.line4_otherGains)
  const line5 = classifyPartIValue(partI.line5_rentalPartnerships)
  const line6 = classifyPartIValue(partI.line6_farmIncome)
  const line7 = classifyPartIValue(partI.line7_unemploymentCompensation)
  const line8b = classifyPartIValue(partI.line8b_gambling)
  const line8h = classifyPartIValue(partI.line8h_juryDuty)
  const line8i = classifyPartIValue(partI.line8i_prizes)
  const line8z = classifyPartIValue(partI.line8z_otherIncome)

  const partIEmpty: EmptyLine[] = []
  if (line1a !== 'visible') {
    partIEmpty.push({
      lineNumber: '1a',
      label: 'Taxable refunds, credits, or offsets of state/local income taxes',
      state: line1a,
      tooltip: line1a === 'zero' ? 'No taxable refunds reported on any 1099-G box 2.' : undefined,
    } as EmptyLine)
  }
  if (line2a !== 'visible') {
    partIEmpty.push({
      lineNumber: '2a',
      label: 'Alimony received (pre-2019 decrees only)',
      state: line2a,
      ...(line2aAlimonyInput ? { manualEntry: line2aAlimonyInput } : {}),
    } as EmptyLine)
  }
  if (line3 !== 'visible') {
    partIEmpty.push({
      lineNumber: '3',
      label: 'Business income or (loss)',
      state: line3,
      sourceTab: TAX_TABS.scheduleC,
      sourceLabel: 'Schedule C',
    } as EmptyLine)
  }
  if (line4 !== 'visible') {
    partIEmpty.push({
      lineNumber: '4',
      label: 'Other gains or (losses) — Form 4797',
      state: line4,
    } as EmptyLine)
  }
  if (line5 !== 'visible') {
    partIEmpty.push({
      lineNumber: '5',
      label: 'Rental real estate, royalties, partnerships, S-corps, trusts',
      state: line5,
      sourceTab: TAX_TABS.scheduleE,
      sourceLabel: 'Schedule E',
    } as EmptyLine)
  }
  if (line6 !== 'visible') {
    partIEmpty.push({
      lineNumber: '6',
      label: 'Farm income or (loss) — Schedule F',
      state: line6,
    } as EmptyLine)
  }
  if (line7 !== 'visible') {
    partIEmpty.push({ lineNumber: '7', label: 'Unemployment compensation (1099-G box 1)', state: line7 } as EmptyLine)
  }
  if (line8b !== 'visible') {
    partIEmpty.push({ lineNumber: '8b', label: 'Gambling winnings', state: line8b } as EmptyLine)
  }
  if (line8h !== 'visible') {
    partIEmpty.push({ lineNumber: '8h', label: 'Jury duty pay', state: line8h } as EmptyLine)
  }
  if (line8i !== 'visible') {
    partIEmpty.push({ lineNumber: '8i', label: 'Prizes and awards', state: line8i } as EmptyLine)
  }
  if (line8z !== 'visible') {
    partIEmpty.push({ lineNumber: '8z', label: 'Other income (1099-MISC routed to line 8z)', state: line8z } as EmptyLine)
  }

  const partIIEmpty: EmptyLine[] = []
  if (partII.line13_hsaDeduction === null || partII.line13_hsaDeduction === 0) {
    partIIEmpty.push({
      lineNumber: '13',
      label: 'Health savings account (HSA) deduction',
      state: partII.line13_hsaDeduction === 0 ? 'zero' : 'null',
    })
  }
  if (partII.line17_selfEmployedHealthInsurance === null || partII.line17_selfEmployedHealthInsurance === 0) {
    partIIEmpty.push({
      lineNumber: '17',
      label: 'Self-employed health insurance deduction',
      state: partII.line17_selfEmployedHealthInsurance === 0 ? 'zero' : 'null',
    })
  }
  if (partII.line20_iraDeduction === null || partII.line20_iraDeduction === 0) {
    partIIEmpty.push({
      lineNumber: '20',
      label: 'IRA deduction',
      state: partII.line20_iraDeduction === 0 ? 'zero' : 'null',
    })
  }
  if (partII.line21_studentLoanInterest === null || partII.line21_studentLoanInterest === 0) {
    partIIEmpty.push({
      lineNumber: '21',
      label: 'Student loan interest deduction',
      state: partII.line21_studentLoanInterest === 0 ? 'zero' : 'null',
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold mb-0.5">Schedule 1 — {selectedYear}</h3>
        <p className="text-xs text-muted-foreground">
          Additional Income and Adjustments to Income — Part I (Additional Income) feeds Form 1040 line 8
        </p>
      </div>

      <FormBlock title="Part I — Additional Income">
        {line1a === 'visible' && (
          <>
            <FormLine boxRef="1a" label="Taxable refunds, credits, or offsets of state and local income taxes" value={partI.line1a_taxableRefunds} />
            <FormSubLine text="From 1099-G box 2" />
          </>
        )}
        {line2a === 'visible' && (
          <>
            <FormLine boxRef="2a" label="Alimony received" value={partI.line2a_alimonyReceived} />
            <FormSubLine text="Pre-2019 divorce decrees only (manual entry)" />
          </>
        )}
        {line3 === 'visible' && (
          <>
            <FormLine boxRef="3" label="Business income or (loss)" value={partI.line3_business} />
            <FormSubLine text="From Schedule C net income" />
          </>
        )}
        {line4 === 'visible' && (
          <>
            <FormLine boxRef="4" label="Other gains or (losses)" value={partI.line4_otherGains} />
            <FormSubLine text="From Form 4797 Part I net result" />
          </>
        )}
        {line5 === 'visible' && (
          <>
            <FormLine
              boxRef="5"
              label="Rental real estate, royalties, partnerships, S corporations, trusts"
              value={partI.line5_rentalPartnerships}
            />
            <FormSubLine text="From Schedule E combined total" />
          </>
        )}
        {line6 === 'visible' && (
          <>
            <FormLine boxRef="6" label="Farm income or (loss)" value={partI.line6_farmIncome} />
            <FormSubLine text="From Schedule F net profit/loss" />
          </>
        )}
        {line7 === 'visible' && (
          <>
            <FormLine boxRef="7" label="Unemployment compensation" value={partI.line7_unemploymentCompensation} />
            <FormSubLine text="From 1099-G box 1" />
          </>
        )}
        {line8b === 'visible' && (
          <>
            <FormLine boxRef="8b" label="Gambling winnings" value={partI.line8b_gambling} />
            <FormSubLine text="From 1099-MISC routed to Schedule 1 line 8b" />
          </>
        )}
        {line8h === 'visible' && (
          <>
            <FormLine boxRef="8h" label="Jury duty pay" value={partI.line8h_juryDuty} />
            <FormSubLine text="From 1099-MISC routed to Schedule 1 line 8h" />
          </>
        )}
        {line8i === 'visible' && (
          <>
            <FormLine boxRef="8i" label="Prizes and awards" value={partI.line8i_prizes} />
            <FormSubLine text="From 1099-MISC routed to Schedule 1 line 8i" />
          </>
        )}
        {line8z === 'visible' && (
          <>
            <FormLine boxRef="8z" label="Other income" value={partI.line8z_otherIncome} />
            <FormSubLine text="From reviewed 1099-MISC documents routed to Schedule 1 line 8" />
          </>
        )}
        {partI.line9_totalOther !== 0 && (
          <FormTotalLine boxRef="9" label="Total other income (sum of lines 8a-8z)" value={partI.line9_totalOther} />
        )}
        <FormTotalLine
          boxRef="10"
          label="Total additional income (to Form 1040 line 8)"
          value={partI.line10_total}
          double
        />
        <EmptyLinesDisclosure
          lines={partIEmpty}
          sectionLabel="Part I"
          {...(onTabChange ? { onGoToSource: onTabChange } : {})}
        />
      </FormBlock>

      <FormBlock title="Part II — Adjustments to Income">
        <FormLine
          boxRef="15"
          label="Deductible part of self-employment tax"
          value={partII.line15_deductibleSeTax}
        />
        <FormSubLine text="Computed from Schedule SE and included in Form 1040 line 10." />
        <FormTotalLine
          boxRef="26"
          label="Total adjustments to income (to Form 1040 line 10)"
          value={partII.line26_totalAdjustments}
          double
        />
        <EmptyLinesDisclosure
          lines={partIIEmpty}
          sectionLabel="Part II"
          {...(onTabChange ? { onGoToSource: onTabChange } : {})}
        />
      </FormBlock>
    </div>
  )
}
