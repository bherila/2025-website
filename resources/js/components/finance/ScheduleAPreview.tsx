'use client'

import currency from 'currency.js'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { useState } from 'react'

import {
  TransactionList,
  type TransactionListColumn,
} from '@/components/finance/tax-preview/TransactionList'
import { FactsLoadingPlaceholder, FormBlock, FormLine, FormTotalLine, InfoTooltip } from '@/components/finance/tax-preview-primitives'
import { taxFactSourcesNeedReview } from '@/components/finance/TaxFactSourceDetailColumn'
import { Button } from '@/components/ui/button'
import { transactionsUrl } from '@/lib/financeRouteBuilder'
import type { ScheduleAFacts, TaxFactSource, TaxPreviewTransaction } from '@/types/generated/tax-preview-facts'

interface ScheduleAPreviewProps {
  selectedYear: number
  isMarried?: boolean
  scheduleAFacts?: ScheduleAFacts | null
  /** Push a `tax-source-detail` Miller column for a `<form>:<line>` instance key. */
  onOpenDetail?: (instanceKey: string) => void
}

const otherItemizedTransactionColumns: TransactionListColumn<TaxPreviewTransaction>[] = [
  {
    key: 'date',
    label: 'Date',
    render: (transaction) => transaction.date,
    className: 'font-mono text-muted-foreground',
  },
  {
    key: 'description',
    label: 'Description',
    render: (transaction) => transaction.description ?? 'Transaction',
    className: 'truncate text-muted-foreground',
  },
  {
    key: 'amount',
    label: 'Amount',
    align: 'right',
    render: (transaction) => currency(transaction.amount).format(),
    className: 'font-mono text-muted-foreground',
  },
]

function otherItemizedTransactionAction(transaction: TaxPreviewTransaction) {
  if (transaction.accountId === null) {
    return null
  }

  return (
    <a
      href={transactionsUrl(transaction.accountId, { hash: `t_id=${transaction.transactionId}` })}
      target="_blank"
      rel="noreferrer"
      title="Go to transaction"
    >
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Go to transaction">
        <ExternalLink className="h-4 w-4" />
      </Button>
    </a>
  )
}

export default function ScheduleAPreview({
  selectedYear,
  isMarried = false,
  scheduleAFacts,
  onOpenDetail,
}: ScheduleAPreviewProps) {
  const [showLine16Transactions, setShowLine16Transactions] = useState(false)

  if (!scheduleAFacts) {
    return <FactsLoadingPlaceholder label="Schedule A" />
  }

  const standardDeduction = isMarried
    ? scheduleAFacts.standardDeductionMarriedFilingJointly
    : scheduleAFacts.standardDeductionSingle
  const shouldItemize = isMarried
    ? scheduleAFacts.shouldItemizeMarriedFilingJointly
    : scheduleAFacts.shouldItemizeSingle
  const selectedLine5aSources = scheduleAFacts.selectedLine5aType === 'sales_tax'
    ? scheduleAFacts.salesTaxSources
    : scheduleAFacts.stateIncomeTaxSources
  const line5aLabel = scheduleAFacts.selectedLine5aType === 'sales_tax'
    ? 'State/local general sales taxes'
    : 'State income tax withheld / estimated tax paid'
  const investmentInterestNeedsReview = taxFactSourcesNeedReview(scheduleAFacts.investmentInterestSources)
  const otherItemizedTransactions = scheduleAFacts.otherItemizedTransactions ?? []
  const otherItemizedTransactionTotal = otherItemizedTransactions
    .reduce((sum, transaction) => sum.add(transaction.amount), currency(0))
    .value

  const sourceClickProps = (key: string, title: string, sources: TaxFactSource[]) =>
    sources.length > 0 && onOpenDetail
      ? {
          onDetails: () => onOpenDetail(key),
          detailsTooltip: title,
          detailsGlyph: 'column' as const,
        }
      : {}

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold mb-0.5">Schedule A — {selectedYear}</h3>
        <p className="text-xs text-muted-foreground">Itemized Deductions</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <FormBlock title="Part I — Medical and Dental Expenses">
          <FormLine boxRef="1" label="Medical expenses" raw="—" />
          <FormTotalLine boxRef="4" label="Deductible medical" value={0} />
        </FormBlock>

        <FormBlock title="Part II — Taxes You Paid">
          <FormLine
            boxRef="5a"
            label={line5aLabel}
            {...(scheduleAFacts.selectedLine5aTotal > 0 ? { value: scheduleAFacts.selectedLine5aTotal } : { raw: '—' })}
            isReviewed={taxFactSourcesNeedReview(selectedLine5aSources) ? false : undefined}
            {...sourceClickProps('sch-a:line-5a', 'Schedule A Line 5a Supporting Details', selectedLine5aSources)}
          />
          <FormLine
            boxRef="5b"
            label="Real estate taxes"
            {...(scheduleAFacts.realEstateTaxTotal > 0 ? { value: scheduleAFacts.realEstateTaxTotal } : { raw: '—' })}
            isReviewed={taxFactSourcesNeedReview(scheduleAFacts.realEstateTaxSources) ? false : undefined}
            {...sourceClickProps('sch-a:line-5b', 'Schedule A Line 5b Supporting Details', scheduleAFacts.realEstateTaxSources)}
          />
          <FormLine
            boxRef="5c"
            label="Personal property taxes"
            raw="—"
          />
          <FormLine boxRef="6" label="Other taxes" raw="—" />
          <FormTotalLine
            boxRef="7"
            label={`Total SALT (capped at $${scheduleAFacts.saltCap.toLocaleString()})`}
            value={scheduleAFacts.saltDeduction}
          />
          {scheduleAFacts.saltCapNeedsMagi && (
            <FormLine label="MAGI needed" raw="SALT phase-down not applied until MAGI is available" />
          )}
          {scheduleAFacts.saltCapUsesEstimatedMagi && scheduleAFacts.saltCapMagi !== null && (
            <FormLine label="MAGI estimate" value={scheduleAFacts.saltCapMagi} />
          )}
          {scheduleAFacts.saltPaidBeforeCap >= scheduleAFacts.saltCap && (
            <FormLine label="Note" raw={`SALT cap reached — state taxes above $${scheduleAFacts.saltCap.toLocaleString()} are not deductible`} />
          )}
        </FormBlock>

        <FormBlock title="Part IV — Interest You Paid">
          <FormLine
            boxRef="8"
            label="Home mortgage interest"
            {...(scheduleAFacts.mortgageInterestTotal > 0 ? { value: scheduleAFacts.mortgageInterestTotal } : { raw: '—' })}
            isReviewed={taxFactSourcesNeedReview(scheduleAFacts.mortgageInterestSources) ? false : undefined}
            {...sourceClickProps('sch-a:line-8', 'Schedule A Line 8 Supporting Details', scheduleAFacts.mortgageInterestSources)}
          />
          <FormLine
            boxRef="9"
            label={<>Investment interest expense (from Form 4952) <InfoTooltip>Only the ordinary §163(d)(5)(A)(i) portion of Form 4952&apos;s allowed investment interest is itemized here. Any portion attributable to a trader-fund K-1 (§163(d)(5)(A)(ii)) is deducted above-the-line on Schedule E, Part II, line 28 instead. Rev. Rul. 2008-38; Announcement 2008-65.</InfoTooltip></>}
            value={scheduleAFacts.investmentInterestTotal > 0 ? scheduleAFacts.investmentInterestTotal : null}
            {...(scheduleAFacts.investmentInterestTotal === 0 ? { raw: '—' } : {})}
            isReviewed={investmentInterestNeedsReview ? false : undefined}
            {...sourceClickProps('sch-a:line-9', 'Investment Interest Expense — Data Sources', scheduleAFacts.investmentInterestSources)}
          />
          {scheduleAFacts.disallowedInvestmentInterest > 0 && (
            <FormLine label="Disallowed investment interest carryforward" value={scheduleAFacts.disallowedInvestmentInterest} />
          )}
          <FormTotalLine boxRef="10" label="Total interest" value={scheduleAFacts.totalInterest} />
        </FormBlock>

        <FormBlock title="Part V — Gifts to Charity">
          <FormLine
            boxRef="11"
            label="Cash contributions"
            {...(scheduleAFacts.charitableCashTotal > 0 ? { value: scheduleAFacts.charitableCashTotal } : { raw: '—' })}
            isReviewed={taxFactSourcesNeedReview(scheduleAFacts.charitableCashSources) ? false : undefined}
            {...sourceClickProps('sch-a:line-11', 'Schedule A Line 11 Supporting Details', scheduleAFacts.charitableCashSources)}
          />
          <FormLine
            boxRef="12"
            label="Non-cash contributions"
            {...(scheduleAFacts.charitableNoncashTotal > 0 ? { value: scheduleAFacts.charitableNoncashTotal } : { raw: '—' })}
            isReviewed={taxFactSourcesNeedReview(scheduleAFacts.charitableNoncashSources) ? false : undefined}
            {...sourceClickProps('sch-a:line-12', 'Schedule A Line 12 Supporting Details', scheduleAFacts.charitableNoncashSources)}
          />
          <FormTotalLine boxRef="14" label="Total gifts" value={scheduleAFacts.charitableTotal} />
        </FormBlock>

        <FormBlock title="Other Itemized Deductions">
          {scheduleAFacts.otherItemizedSources.map((src) => (
            <FormLine
              key={src.id}
              label={src.label}
              value={src.amount}
              isReviewed={src.isReviewed === false ? false : undefined}
              {...sourceClickProps('sch-a:line-16', 'Schedule A Line 16 Supporting Details', scheduleAFacts.otherItemizedSources)}
            />
          ))}
          {scheduleAFacts.otherItemizedSources.length === 0 && otherItemizedTransactions.length === 0 && (
            <FormLine label="No other itemized deductions" raw="—" />
          )}
          {otherItemizedTransactions.length > 0 && (
            <div className="space-y-2 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium">Ledger transactions</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setShowLine16Transactions((value) => !value)}
                >
                  {showLine16Transactions ? 'Hide' : 'Show'}
                  {showLine16Transactions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </div>
              {showLine16Transactions && (
                <TransactionList
                  rows={otherItemizedTransactions}
                  columns={otherItemizedTransactionColumns}
                  getRowKey={(transaction) => transaction.transactionId}
                  rowAction={otherItemizedTransactionAction}
                  total={currency(otherItemizedTransactionTotal).format()}
                />
              )}
            </div>
          )}
          <FormTotalLine
            boxRef="16"
            label="Other itemized deductions"
            value={scheduleAFacts.otherItemizedTotal}
          />
        </FormBlock>
      </div>

      {scheduleAFacts.investmentInterestSources.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No investment interest expense sources found in backend tax facts.
        </p>
      )}

      <FormBlock title="Standard Deduction vs. Itemized — Which Is Better?">
        <FormLine label={`Standard deduction (${selectedYear} ${isMarried ? 'Married Filing Jointly' : 'Single'})`} value={standardDeduction} />
        <FormLine label="Itemized deductions (Schedule A total)" value={scheduleAFacts.totalItemizedDeductions} />
        <FormLine label="Investment interest (Line 9)" value={scheduleAFacts.investmentInterestTotal} />
        <FormLine
          label="SALT (Line 7)"
          {...(scheduleAFacts.saltDeduction > 0 ? { value: scheduleAFacts.saltDeduction } : { raw: '—' })}
        />
        {scheduleAFacts.mortgageInterestTotal > 0 && <FormLine label="Mortgage interest (Line 8)" value={scheduleAFacts.mortgageInterestTotal} />}
        {scheduleAFacts.charitableTotal > 0 && <FormLine label="Charitable contributions (Lines 11–12)" value={scheduleAFacts.charitableTotal} />}
        {scheduleAFacts.otherItemizedTotal > 0 && <FormLine label="Other deductions (Line 16)" value={scheduleAFacts.otherItemizedTotal} />}
        <FormLine label="Medical, casualty, other" raw="Enter below — not yet computed" />
        <FormTotalLine
          label={shouldItemize
            ? '✓ Itemizing saves more — use Schedule A'
            : `Standard deduction is larger by ${currency(standardDeduction).subtract(scheduleAFacts.totalItemizedDeductions).format()}`}
          value={shouldItemize ? scheduleAFacts.totalItemizedDeductions : standardDeduction}
          double
        />
        {!shouldItemize && (
          <FormLine
            label="Note"
            raw="Additional deductions may still make itemizing beneficial as entries change throughout the year."
          />
        )}
      </FormBlock>

    </div>
  )
}
