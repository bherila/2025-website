'use client'

import currency from 'currency.js'
import { useState } from 'react'

import { isFK1StructuredData } from '@/components/finance/k1'
import { FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { TaxFactSourcesModal } from '@/components/finance/TaxFactSourcesModal'
import { getK1CodeItems } from '@/lib/finance/k1Utils'
import { parseMoney } from '@/lib/finance/money'
import type { ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import { type FilingStatus, getSaltCap, getStandardDeduction } from '@/lib/tax/standardDeductions'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { Form4952Lines, ScheduleALines, UserDeductionEntry } from '@/types/finance/tax-return'
import type { Form4952Facts, ScheduleAFacts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import { ShortDividendSummaryCard } from './ShortDividendDetailModal'

export type { ScheduleALines } from '@/types/finance/tax-return'

interface InvIntSource {
  label: string
  /** Negative means expense (charge). Positive means income. */
  amount: number
}

type InvestmentInterestDisplaySource = InvIntSource | TaxFactSource

/** Bucket user deductions by category in a single pass. */
function bucketUserDeductions(userDeductions: UserDeductionEntry[]): Record<string, number> {
  const buckets: Record<string, number> = {}
  for (const d of userDeductions) {
    buckets[d.category] = currency(buckets[d.category] ?? 0).add(d.amount).value
  }
  return buckets
}

export function computeScheduleALines({
  reviewedK1Docs = [],
  reviewed1099Docs = [],
  shortDividendSummary,
  saltPaid = 0,
  year = new Date().getFullYear(),
  isMarried = false,
  userDeductions = [],
  form4952,
}: {
  reviewedK1Docs?: TaxDocument[]
  reviewed1099Docs?: TaxDocument[]
  shortDividendSummary?: ShortDividendSummary
  /** W-2 Box 17 state tax withheld. User-entered SALT is added separately. */
  saltPaid?: number
  year?: number
  isMarried?: boolean
  userDeductions?: UserDeductionEntry[]
  form4952?: Form4952Lines | undefined
}): ScheduleALines {
  const invIntSources: InvIntSource[] = []
  const otherItemizedSources: { label: string; amount: number }[] = []

  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const hItems = getK1CodeItems(data, '13', 'H')
    for (const item of hItems) {
      const n = parseMoney(item.value)
      if (n !== null && n !== 0) {
        invIntSources.push({
          label: `${partnerName} — K-1 Box 13H (investment interest)`,
          amount: currency(0).subtract(Math.abs(n)).value,
        })
      }
    }
    const gItems = getK1CodeItems(data, '13', 'G')
    for (const item of gItems) {
      const n = parseMoney(item.value)
      if (n !== null && n !== 0) {
        invIntSources.push({ label: `${partnerName} — K-1 Box 13G (investment interest)`, amount: currency(0).subtract(Math.abs(n)).value })
      }
    }
    // Box 13L — portfolio deduction (no 2% floor) → Sch A Line 16
    const lItems = getK1CodeItems(data, '13', 'L')
    for (const item of lItems) {
      const n = parseMoney(item.value)
      if (n !== null && n !== 0) {
        otherItemizedSources.push({
          label: `${partnerName} — K-1 Box 13L (portfolio deduction, no 2% floor)`,
          amount: Math.abs(n),
        })
      }
    }
  }

  for (const doc of reviewed1099Docs) {
    const p = doc.parsed_data as Record<string, unknown>
    const payer = (p?.payer_name as string | undefined) ?? doc.employment_entity?.display_name ?? '1099'
    const box5 = p?.box5_investment_expense ?? p?.int_5_investment_expenses
    if (typeof box5 === 'number' && box5 !== 0) {
      invIntSources.push({ label: `${payer} — 1099-INT Box 5 (investment expense)`, amount: currency(0).subtract(Math.abs(box5)).value })
    }
    const bIntInvExp = p?.b_investment_expenses
    if (typeof bIntInvExp === 'number' && bIntInvExp !== 0) {
      invIntSources.push({ label: `${payer} — 1099-B investment expense`, amount: currency(0).subtract(Math.abs(bIntInvExp)).value })
    }
  }

  const shortDivDeduction = shortDividendSummary?.totalItemizedDeduction ?? 0
  if (shortDivDeduction > 0) {
    invIntSources.push({
      label: 'Short dividends — positions held > 45 days (IRS Pub. 550)',
      amount: currency(0).subtract(shortDivDeduction).value,
    })
  }

  const rawInvIntExpense = invIntSources.reduce(
    (acc, s) => acc.add(Math.abs(s.amount)),
    currency(0),
  ).value
  const totalInvIntExpense = form4952
    ? form4952.deductibleInvestmentInterestExpense
    : rawInvIntExpense

  const buckets = bucketUserDeductions(userDeductions)
  const stateIncomeTax = currency(saltPaid).add(buckets.state_est_tax ?? 0).value
  const salesTax = buckets.sales_tax ?? 0
  const realEstateTax = buckets.real_estate_tax ?? 0
  const selectedLine5a = Math.max(stateIncomeTax, salesTax)
  const mortgageInterest = buckets.mortgage_interest ?? 0
  const charitable = currency(buckets.charitable_cash ?? 0).add(buckets.charitable_noncash ?? 0).value
  const otherDeductions = buckets.other ?? 0

  const saltPaidBeforeCap = currency(selectedLine5a).add(realEstateTax).value
  const saltCap = getSaltCap(year)
  const saltDeduction = Math.min(saltPaidBeforeCap, saltCap)
  const totalOtherItemized = otherItemizedSources.reduce(
    (acc, s) => acc.add(s.amount),
    currency(0),
  ).value
  const totalItemizedDeductions = currency(totalInvIntExpense)
    .add(saltDeduction)
    .add(mortgageInterest)
    .add(charitable)
    .add(otherDeductions)
    .add(totalOtherItemized).value
  // MFJ/MFS sharing: isMarried collapses both into MFJ for now. MFS users should
  // expect a smaller separate-return SALT cap and different brackets; unsupported until
  // MFJ-vs-MFS is added to the marriage-status settings.
  const filingStatus: FilingStatus = isMarried ? 'Married Filing Jointly' : 'Single'
  const standardDeduction = getStandardDeduction(year, filingStatus)
  const shouldItemize = totalItemizedDeductions > standardDeduction

  return {
    invIntSources,
    totalInvIntExpense,
    saltPaid: saltPaidBeforeCap,
    saltDeduction,
    mortgageInterest,
    charitable,
    otherDeductions,
    otherItemizedSources,
    totalOtherItemized,
    userDeductions,
    totalItemizedDeductions,
    standardDeduction,
    shouldItemize,
  }
}

interface ScheduleAPreviewProps {
  selectedYear: number
  reviewedK1Docs?: TaxDocument[]
  reviewed1099Docs?: TaxDocument[]
  shortDividendSummary?: ShortDividendSummary
  /** State and local taxes paid (from W-2 Box 17). Capped on Schedule A line 7. */
  saltPaid?: number
  isMarried?: boolean
  userDeductions?: UserDeductionEntry[]
  form4952?: Form4952Lines | undefined
  form4952Facts?: Form4952Facts | null
  scheduleAFacts?: ScheduleAFacts | null
  onOpenDoc?: (docId: number) => void
}

export default function ScheduleAPreview({
  selectedYear,
  reviewedK1Docs = [],
  reviewed1099Docs = [],
  shortDividendSummary,
  saltPaid = 0,
  isMarried = false,
  userDeductions = [],
  form4952,
  form4952Facts,
  scheduleAFacts,
  onOpenDoc,
}: ScheduleAPreviewProps) {
  const [showInvIntModal, setShowInvIntModal] = useState(false)

  const shortDivDeduction = shortDividendSummary?.totalItemizedDeduction ?? 0
  const { invIntSources, totalInvIntExpense, saltPaid: totalSaltPaidBeforeCap, saltDeduction, mortgageInterest, charitable, otherDeductions, otherItemizedSources, totalOtherItemized, totalItemizedDeductions, standardDeduction, shouldItemize } = computeScheduleALines({
    reviewedK1Docs,
    reviewed1099Docs,
    ...(shortDividendSummary ? { shortDividendSummary } : {}),
    saltPaid,
    year: selectedYear,
    isMarried,
    userDeductions,
    form4952,
  })

  const buckets = bucketUserDeductions(userDeductions)
  const realEstateTax = scheduleAFacts?.realEstateTaxTotal ?? buckets.real_estate_tax ?? 0
  const salesTax = buckets.sales_tax ?? 0
  const saltCap = scheduleAFacts?.saltCap ?? getSaltCap(selectedYear)
  const charitableCash = scheduleAFacts?.charitableCashTotal ?? buckets.charitable_cash ?? 0
  const charitableNoncash = scheduleAFacts?.charitableNoncashTotal ?? buckets.charitable_noncash ?? 0
  const stateIncomeTax = scheduleAFacts?.stateIncomeTaxTotal ?? currency(saltPaid).add(buckets.state_est_tax ?? 0).value
  const line5aLabel = (scheduleAFacts?.selectedLine5aType ?? (salesTax > stateIncomeTax ? 'sales_tax' : 'state_income_tax')) === 'sales_tax'
    ? 'State/local general sales taxes'
    : 'State income tax withheld / estimated tax paid'
  const line5aAmount = scheduleAFacts?.selectedLine5aTotal ?? Math.max(stateIncomeTax, salesTax)
  const totalInvIntExpenseDisplay = form4952Facts?.deductibleInvestmentInterestExpense ?? totalInvIntExpense
  const totalInterest = scheduleAFacts?.totalInterest ?? currency(mortgageInterest).add(totalInvIntExpenseDisplay).value
  const invIntFactSources = form4952Facts?.investmentInterestSources ?? []
  const invIntModalSources: InvestmentInterestDisplaySource[] = invIntFactSources.length > 0 ? invIntFactSources : invIntSources
  const invIntNeedsReview = invIntFactSources.some((source) => !source.isReviewed)
  const invIntModalTotal = form4952Facts?.deductibleInvestmentInterestExpense ?? totalInvIntExpense
  const totalSaltPaidBeforeCapDisplay = scheduleAFacts?.saltPaidBeforeCap ?? totalSaltPaidBeforeCap
  const saltDeductionDisplay = scheduleAFacts?.saltDeduction ?? saltDeduction
  const totalItemizedDeductionsDisplay = scheduleAFacts?.totalItemizedDeductions ?? totalItemizedDeductions
  const standardDeductionDisplay = scheduleAFacts
    ? isMarried ? scheduleAFacts.standardDeductionMarriedFilingJointly : scheduleAFacts.standardDeductionSingle
    : standardDeduction
  const shouldItemizeDisplay = scheduleAFacts
    ? isMarried ? scheduleAFacts.shouldItemizeMarriedFilingJointly : scheduleAFacts.shouldItemizeSingle
    : shouldItemize

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold mb-0.5">Schedule A — {selectedYear}</h3>
        <p className="text-xs text-muted-foreground">Itemized Deductions</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Part I — Medical */}
        <FormBlock title="Part I — Medical and Dental Expenses">
          <FormLine boxRef="1" label="Medical expenses" raw="—" />
          <FormTotalLine boxRef="4" label="Deductible medical" value={0} />
        </FormBlock>

        {/* Part II — Taxes */}
        <FormBlock title="Part II — Taxes You Paid">
          <FormLine
            boxRef="5a"
            label={line5aLabel}
            {...(line5aAmount > 0 ? { value: line5aAmount } : { raw: '—' })}
          />
          <FormLine
            boxRef="5b"
            label="Real estate taxes"
            {...(realEstateTax > 0 ? { value: realEstateTax } : { raw: '—' })}
          />
          <FormLine
            boxRef="5c"
            label="Personal property taxes"
            raw="—"
          />
          <FormLine boxRef="6" label="Other taxes" raw="—" />
          <FormTotalLine
            boxRef="7"
            label={`Total SALT (capped at $${saltCap.toLocaleString()})`}
            value={saltDeductionDisplay}
          />
          {scheduleAFacts?.saltCapNeedsMagi && (
            <FormLine label="MAGI needed" raw="SALT phase-down not applied until MAGI is available" />
          )}
          {scheduleAFacts?.saltCapUsesEstimatedMagi && scheduleAFacts.saltCapMagi !== null && (
            <FormLine label="MAGI estimate" value={scheduleAFacts.saltCapMagi} />
          )}
          {totalSaltPaidBeforeCapDisplay >= saltCap && (
            <FormLine label="Note" raw={`SALT cap reached — state taxes above $${saltCap.toLocaleString()} are not deductible`} />
          )}
        </FormBlock>

        {/* Part IV — Interest */}
        <FormBlock title="Part IV — Interest You Paid">
          <FormLine
            boxRef="8"
            label="Home mortgage interest"
            {...(mortgageInterest > 0 ? { value: mortgageInterest } : { raw: '—' })}
          />
          <FormLine
            boxRef="9"
            label="Investment interest expense (from Form 4952)"
            value={totalInvIntExpenseDisplay > 0 ? totalInvIntExpenseDisplay : null}
            {...(totalInvIntExpenseDisplay === 0 ? { raw: '—' } : {})}
            isReviewed={invIntNeedsReview ? false : undefined}
            {...(invIntModalSources.length > 0 ? { onClick: () => setShowInvIntModal(true) } : {})}
          />
          <FormTotalLine boxRef="10" label="Total interest" value={totalInterest} />
        </FormBlock>

        {/* Part V — Gifts */}
        <FormBlock title="Part V — Gifts to Charity">
          <FormLine
            boxRef="11"
            label="Cash contributions"
            {...(charitableCash > 0 ? { value: charitableCash } : { raw: '—' })}
          />
          <FormLine
            boxRef="12"
            label="Non-cash contributions"
            {...(charitableNoncash > 0 ? { value: charitableNoncash } : { raw: '—' })}
          />
          <FormTotalLine boxRef="14" label="Total gifts" value={charitable} />
        </FormBlock>

        <FormBlock title="Other Itemized Deductions">
          {otherDeductions > 0 && (
            <FormLine label="User-entered other deductions" value={otherDeductions} />
          )}
          {otherItemizedSources.map((src, i) => (
            <FormLine key={`k1-oth-${i}`} label={src.label} value={src.amount} />
          ))}
          <FormTotalLine
            boxRef="16"
            label="Other itemized deductions"
            value={currency(otherDeductions).add(totalOtherItemized).value}
          />
        </FormBlock>
      </div>

      {/* Short dividend detail */}
      {shortDividendSummary && shortDividendSummary.entries.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Short Dividend — Investment Interest Detail</h4>
          <p className="text-xs text-muted-foreground">
            Per IRS Publication 550, dividends charged on short positions held more than 45 days
            are deductible as investment interest expense on Schedule A Line 9, subject to the
            Form 4952 net investment income limitation. Click a category below for supporting
            transactions.
          </p>
          <ShortDividendSummaryCard summary={shortDividendSummary} />
        </div>
      )}

      {(!shortDividendSummary || shortDividendSummary.entries.length === 0) && shortDivDeduction === 0 && invIntSources.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No investment interest expense sources found. K-1 Box 13H, 1099-INT Box 5, and short
          dividends (from account Lots tab) will appear here when available.
        </p>
      )}

      {/* Standard vs. itemized comparison */}
      <FormBlock title="Standard Deduction vs. Itemized — Which Is Better?">
        <FormLine label={`Standard deduction (${selectedYear} ${isMarried ? 'Married Filing Jointly' : 'Single'})`} value={standardDeductionDisplay} />
        <FormLine label="Itemized deductions (Schedule A total)" value={totalItemizedDeductionsDisplay} />
        <FormLine label="Investment interest (Line 9)" value={totalInvIntExpenseDisplay} />
        <FormLine
          label="SALT (Line 7)"
          {...(saltDeductionDisplay > 0 ? { value: saltDeductionDisplay } : { raw: '—' })}
        />
        {mortgageInterest > 0 && <FormLine label="Mortgage interest (Line 8)" value={mortgageInterest} />}
        {charitable > 0 && <FormLine label="Charitable contributions (Lines 11–12)" value={charitable} />}
        {otherDeductions > 0 && <FormLine label="Other deductions" value={otherDeductions} />}
        {totalOtherItemized > 0 && <FormLine label="K-1 Box 13L portfolio deductions (Line 16)" value={totalOtherItemized} />}
        <FormLine label="Medical, casualty, other" raw="Enter below — not yet computed" />
        <FormTotalLine
          label={shouldItemizeDisplay
            ? '✓ Itemizing saves more — use Schedule A'
            : `Standard deduction is larger by ${currency(standardDeductionDisplay - totalItemizedDeductionsDisplay).format()}`}
          value={shouldItemizeDisplay ? totalItemizedDeductionsDisplay : standardDeductionDisplay}
          double
        />
        {!shouldItemizeDisplay && (
          <FormLine
            label="Note"
            raw="Additional deductions may still make itemizing beneficial as entries change throughout the year."
          />
        )}
      </FormBlock>

      {/* Investment interest drilldown modal */}
      <TaxFactSourcesModal
        open={showInvIntModal}
        title="Investment Interest Expense — Data Sources"
        onClose={() => setShowInvIntModal(false)}
        sources={invIntModalSources}
        total={invIntModalTotal}
        amountMode="absolute"
        positiveAmountTone="destructive"
        referenceText="Reference: IRS Schedule A Line 9. Investment interest is deductible up to net investment income (Form 4952). Excess carries forward."
        {...(onOpenDoc ? { onOpenDoc } : {})}
      />
    </div>
  )
}
