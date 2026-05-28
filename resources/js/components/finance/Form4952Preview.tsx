'use client'

import currency from 'currency.js'
import { useEffect } from 'react'

import { ShortDividendSummaryCard } from '@/components/finance/ShortDividendDetailModal'
import type { ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import type { Form4952Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import { Callout, FactsLoadingPlaceholder, fmtAmt, FormBlock, FormLine, FormTotalLine } from './tax-preview-primitives'

interface Form4952PreviewProps {
  form4952Facts?: Form4952Facts | null
  shortDividendSummary?: ShortDividendSummary | null
  onLoadShortDividendSummary?: () => void
}

function SourceRows({
  sources,
  emptyLabel,
  amountMode = 'signed',
}: {
  sources: TaxFactSource[]
  emptyLabel: string
  amountMode?: 'signed' | 'absolute'
}) {
  if (sources.length === 0) {
    return <FormLine label={emptyLabel} raw="—" />
  }

  return (
    <>
      {sources.map((source, index) => (
        <div key={source.id}>
          <FormLine
            {...(index === 0 ? { boxRef: '1a' } : {})}
            label={source.label}
            value={amountMode === 'absolute' ? Math.abs(source.amount) : source.amount}
            isReviewed={source.isReviewed === false ? false : undefined}
          />
          {source.notes && (
            <FormLine label="Note" raw={source.notes} note />
          )}
        </div>
      ))}
    </>
  )
}

export default function Form4952Preview({
  form4952Facts,
  shortDividendSummary,
  onLoadShortDividendSummary,
}: Form4952PreviewProps) {
  useEffect(() => {
    onLoadShortDividendSummary?.()
  }, [onLoadShortDividendSummary])

  if (!form4952Facts) {
    return <FactsLoadingPlaceholder label="Form 4952" />
  }

  const totalInvIntExpense = form4952Facts.totalInvestmentInterestExpense
  const niiBefore = form4952Facts.netInvestmentIncomeBeforeQualifiedDividendElection
  const totalQualDiv = form4952Facts.totalQualifiedDividends
  const hasActivity = totalInvIntExpense !== 0
    || form4952Facts.grossInvestmentIncomeTotal !== 0
    || form4952Facts.totalInvestmentExpenses !== 0
    || form4952Facts.totalExcludedInvestmentExpenses !== 0

  const scenA_deductible = Math.min(totalInvIntExpense, niiBefore)
  const scenA_carryforward = currency(totalInvIntExpense).subtract(scenA_deductible).value
  const noElectionNeeded = scenA_carryforward === 0
  const scenB_nii = currency(niiBefore).add(totalQualDiv).value
  const scenB_deductible = Math.min(totalInvIntExpense, scenB_nii)
  const scenB_carryforward = currency(totalInvIntExpense).subtract(scenB_deductible).value
  const gapToFill = Math.max(0, currency(totalInvIntExpense).subtract(niiBefore).value)
  const scenC_qdElected = Math.min(totalQualDiv, gapToFill)
  const scenC_nii = currency(niiBefore).add(scenC_qdElected).value
  const scenC_deductible = Math.min(totalInvIntExpense, scenC_nii)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 4952 — Investment Interest Expense Deduction</h2>
        <p className="text-xs text-muted-foreground">
          §163(d) limitation — investment interest is deductible to the extent of net investment income (NII).
          Any excess carries forward indefinitely.
        </p>
      </div>

      {!hasActivity && (
        <Callout kind="info" title="No Form 4952 activity detected">
          <p>No investment interest expense or investment income is present in the backend tax facts.</p>
        </Callout>
      )}

      <Callout kind="info" title="ℹ What Form 4952 Does">
        <p>
          Investment interest expense is only deductible to the extent of your{' '}
          <strong>net investment income (NII)</strong>. Excess carries forward. You may elect to include qualified
          dividends in NII, which converts them from preferential to ordinary rates.
        </p>
      </Callout>

      {noElectionNeeded && totalInvIntExpense > 0 && (
        <Callout
          kind="good"
          title={`✓ Full ${fmtAmt(totalInvIntExpense)} Deductible — No QD Election Needed`}
        >
          <p>
            NII of <strong>{fmtAmt(niiBefore)}</strong> already covers investment interest expense of{' '}
            <strong>{fmtAmt(totalInvIntExpense)}</strong>. No carryforward is shown in backend facts.
          </p>
        </Callout>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
        <FormBlock title="Part I — Total Investment Interest Expense">
          <SourceRows
            sources={form4952Facts.investmentInterestSources}
            emptyLabel="No investment interest sources found"
          />
          <FormLine boxRef="2" label="Prior-year disallowed carryforward" raw="Check prior return" />
          <FormTotalLine boxRef="3" label="Total investment interest" value={-totalInvIntExpense} />
        </FormBlock>

        <FormBlock title="Part II — Net Investment Income">
          <FormLine boxRef="4a" label="Gross investment income from Schedule B" value={form4952Facts.grossInvestmentIncomeFromScheduleB} />
          <FormLine boxRef="4a" label="Gross investment income from K-1s" value={form4952Facts.grossInvestmentIncomeFromK1} />
          <FormTotalLine boxRef="4a" label="Gross investment income" value={form4952Facts.grossInvestmentIncomeTotal} />
          {totalQualDiv > 0 && (
            <FormLine boxRef="4b" label="Qualified dividends excluded before election" value={-totalQualDiv} />
          )}
          <FormLine boxRef="4c" label="Net investment income after qualified dividends" value={form4952Facts.line4cNetInvestmentIncomeAfterQualifiedDividends} />
          <SourceRows
            sources={form4952Facts.investmentExpenseSources}
            emptyLabel="No investment expenses reducing NII"
          />
          <FormTotalLine boxRef="6" label="Net investment income (no QD election)" value={niiBefore} />
        </FormBlock>
      </div>

      {form4952Facts.excludedInvestmentExpenseSources.length > 0 && (
        <FormBlock title="Tracked but Excluded Investment Expenses">
          <SourceRows
            sources={form4952Facts.excludedInvestmentExpenseSources}
            emptyLabel="No excluded investment expenses"
          />
          <FormTotalLine label="Total excluded investment expenses" value={form4952Facts.totalExcludedInvestmentExpenses} />
        </FormBlock>
      )}

      {shortDividendSummary && (
        <FormBlock title="Short Dividend Classification">
          <ShortDividendSummaryCard summary={shortDividendSummary} />
        </FormBlock>
      )}

      {!noElectionNeeded && totalQualDiv > 0 && (
        <FormBlock title="Election Analysis — Include Qualified Dividends in NII?">
          <FormLine label="A — No QD election NII" value={niiBefore} />
          <FormLine label="A — Deductible investment interest" value={scenA_deductible} />
          <FormLine label="A — Carryforward" value={scenA_carryforward} />
          <FormLine label="B — Full QD election NII" value={scenB_nii} />
          <FormLine label="B — Deductible investment interest" value={scenB_deductible} />
          <FormLine label="B — Carryforward" value={scenB_carryforward} />
          {scenC_qdElected > 0 && scenC_qdElected < totalQualDiv && (
            <>
              <FormLine label="C — Partial QD election amount" value={scenC_qdElected} />
              <FormLine label="C — Partial QD election NII" value={scenC_nii} />
              <FormLine label="C — Deductible investment interest" value={scenC_deductible} />
            </>
          )}
        </FormBlock>
      )}

      <FormBlock title="Form 4952 Result">
        <FormLine boxRef="7" label="Deductible investment interest expense" value={form4952Facts.deductibleInvestmentInterestExpense} />
        <FormTotalLine boxRef="8" label="Disallowed carryforward" value={form4952Facts.disallowedCarryforward} double />
      </FormBlock>
    </div>
  )
}
