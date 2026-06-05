'use client'

import currency from 'currency.js'
import { useEffect, useState } from 'react'

import Form4952SourceDetailModal from '@/components/finance/Form4952SourceDetailModal'
import { ShortDividendSummaryCard } from '@/components/finance/ShortDividendDetailModal'
import type { ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import { k1CodeSourceFieldId, k1FieldSourceFieldId } from '@/lib/finance/taxSourceFieldIds'
import type { Form4952Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import { Callout, FactsLoadingPlaceholder, fmtAmt, FormBlock, FormLine, FormSubLine, FormTotalLine, InfoTooltip } from './tax-preview-primitives'

interface Form4952PreviewProps {
  form4952Facts?: Form4952Facts | null
  shortDividendSummary?: ShortDividendSummary | null
  onLoadShortDividendSummary?: () => void
  /** Open the source document review modal (K-1 or 1099) at an optional focus field. */
  onReviewDoc?: (docId: number, focusFieldId?: string) => void
  /** Drill to the Schedule B / A / E Miller columns. */
  onOpenScheduleB?: () => void
  onOpenScheduleA?: () => void
  onOpenScheduleE?: () => void
}

function focusFieldIdFor(source: TaxFactSource): string | undefined {
  if (source.box && source.code) {
    return k1CodeSourceFieldId(source.box, source.code)
  }
  if (source.box) {
    return k1FieldSourceFieldId(source.box)
  }
  return undefined
}

interface DetailModalState {
  title: string
  description?: string
  sources: TaxFactSource[]
  amountMode: 'signed' | 'absolute' | 'expense'
}

function SourceRows({
  sources,
  emptyLabel,
  amountMode = 'signed',
  onGoToSource,
}: {
  sources: TaxFactSource[]
  emptyLabel: string
  amountMode?: 'signed' | 'absolute' | 'expense'
  onGoToSource?: (source: TaxFactSource) => void
}) {
  if (sources.length === 0) {
    return <FormLine label={emptyLabel} raw="—" />
  }

  return (
    <>
      {sources.map((source, index) => {
        const value = amountMode === 'absolute'
          ? Math.abs(source.amount)
          : amountMode === 'expense'
            ? -Math.abs(source.amount)
            : source.amount
        const canGoToSource = onGoToSource && source.taxDocumentId != null
        return (
          <div key={source.id}>
            <FormLine
              {...(index === 0 ? { boxRef: '1a' } : {})}
              label={source.label}
              value={value}
              isReviewed={source.isReviewed === false ? false : undefined}
              {...(canGoToSource ? { onDetails: () => onGoToSource(source), detailsLabel: 'Go to source', detailsTooltip: 'Open the source document' } : {})}
            />
            {source.notes && (
              <FormLine label="Note" raw={source.notes} note />
            )}
          </div>
        )
      })}
    </>
  )
}

export default function Form4952Preview({
  form4952Facts,
  shortDividendSummary,
  onLoadShortDividendSummary,
  onReviewDoc,
  onOpenScheduleB,
  onOpenScheduleA,
  onOpenScheduleE,
}: Form4952PreviewProps) {
  const [detailModal, setDetailModal] = useState<DetailModalState | null>(null)

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
  const hasTracingAllocation = form4952Facts.allocationMethod === 'tracing'
    && form4952Facts.tracingSplitSources.length > 0

  // Route a source's "go to source" click to the K-1/1099 review modal (with a focus
  // field for K-1 boxes) or fall back to the Schedule B column for dividend sources.
  const handleGoToSource = (source: TaxFactSource) => {
    if (source.taxDocumentId != null && onReviewDoc) {
      onReviewDoc(source.taxDocumentId, focusFieldIdFor(source))
      return
    }
    onOpenScheduleB?.()
  }

  const drillForDestination = (destination: string): (() => void) | undefined => {
    if (destination === 'sch-a') {
      return onOpenScheduleA
    }
    if (destination === 'sch-e') {
      return onOpenScheduleE
    }
    return undefined
  }

  const showCarryProration = form4952Facts.carryDestinations.length > 1

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
            amountMode="expense"
            onGoToSource={handleGoToSource}
          />
          <FormLine boxRef="2" label="Prior-year disallowed carryforward" raw="Check prior return" />
          <FormTotalLine boxRef="3" label="Total investment interest" value={-totalInvIntExpense} />
        </FormBlock>

        <FormBlock title="Part II — Net Investment Income">
          <FormLine
            boxRef="4a"
            label="Gross investment income from Schedule B"
            value={form4952Facts.grossInvestmentIncomeFromScheduleB}
            {...(onOpenScheduleB && form4952Facts.grossInvestmentIncomeFromScheduleB !== 0 ? { onClick: onOpenScheduleB } : {})}
          />
          <FormLine
            boxRef="4a"
            label="Gross investment income from K-1s"
            value={form4952Facts.grossInvestmentIncomeFromK1}
            {...(form4952Facts.grossInvestmentIncomeFromK1Sources.length > 0
              ? {
                onDetails: () => setDetailModal({
                  title: 'Gross investment income from K-1s (line 4a)',
                  description: 'Each partnership’s share of investment income that feeds Form 4952 line 4a. Net capital gain is excluded.',
                  sources: form4952Facts.grossInvestmentIncomeFromK1Sources,
                  amountMode: 'signed',
                }),
                detailsLabel: 'Sources',
                detailsTooltip: 'List each K-1 and go to its source',
              }
              : {})}
          />
          <FormTotalLine
            boxRef="4a"
            label={<>Gross investment income <InfoTooltip>Form 4952 line 4a: gross income from property held for investment — interest, ordinary dividends, royalties, and K-1 investment income. <strong>Excludes</strong> net capital gain (including net long-term capital gains) and qualified dividends unless elected on lines 4d/4e/4g (which forfeits the preferential rate). IRC §163(d)(4)(B); 2025 Form 4952 line 4a instructions.</InfoTooltip></>}
            value={form4952Facts.grossInvestmentIncomeTotal}
          />
          {totalQualDiv > 0 && (
            <FormLine
              boxRef="4b"
              label={<>Qualified dividends excluded before election <InfoTooltip>Qualified dividends are included in line 4a ordinary dividends but excluded from investment income unless you elect to include them (line 4g). Electing forfeits the preferential qualified-dividend rate on the elected amount. Flush language of IRC §163(d)(4)(B); §1(h)(11)(D)(i).</InfoTooltip></>}
              value={-totalQualDiv}
              {...(form4952Facts.qualifiedDividendSources.length > 0
                ? {
                  onDetails: () => setDetailModal({
                    title: 'Qualified dividends included on line 4a (line 4b)',
                    description: 'These qualified dividends are subtracted on line 4b. Go to each source to verify.',
                    sources: form4952Facts.qualifiedDividendSources,
                    amountMode: 'signed',
                  }),
                  detailsLabel: 'Sources',
                  detailsTooltip: 'List each qualified-dividend source',
                }
                : {})}
            />
          )}
          <FormLine boxRef="4c" label="Net investment income after qualified dividends" value={form4952Facts.line4cNetInvestmentIncomeAfterQualifiedDividends} />
          <SourceRows
            sources={form4952Facts.investmentExpenseSources}
            emptyLabel="No investment expenses reducing NII"
            onGoToSource={handleGoToSource}
          />
          <FormTotalLine
            boxRef="6"
            label={<>Net investment income (no QD election) <InfoTooltip>Form 4952 line 6 (net investment income) = investment income (line 4h) − investment expenses (line 5). Investment interest is deductible only up to this amount; the excess carries forward. IRC §163(d)(1), §163(d)(4)(A).</InfoTooltip></>}
            value={niiBefore}
          />
        </FormBlock>
      </div>

      <Callout kind="info" title="What counts as gross investment income (line 4a)">
        <p>
          Included: interest, ordinary dividends, royalties, and K-1 investment income.{' '}
          <strong>Not included:</strong> net capital gain — including net long-term capital gains — and qualified
          dividends, unless you elect to include them on lines 4d/4e/4g (which gives up the preferential
          capital-gains / qualified-dividend rate on the elected amount). IRC §163(d)(4)(B).
        </p>
      </Callout>

      {form4952Facts.excludedInvestmentExpenseSources.length > 0 && (
        <FormBlock title="Tracked but Excluded Investment Expenses">
          <SourceRows
            sources={form4952Facts.excludedInvestmentExpenseSources}
            emptyLabel="No excluded investment expenses"
            onGoToSource={handleGoToSource}
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

      {form4952Facts.carryDestinations.length > 0 && (
        <FormBlock title="Where the deductible carries">
          {form4952Facts.carryDestinations.map((destination) => {
            const drill = drillForDestination(destination.destination)
            const allocationLabel = hasTracingAllocation ? 'Tracing-based' : 'Pro-rata'
            return (
              <div key={destination.destination}>
                <FormLine
                  label={<>{destination.label} <InfoTooltip>{destination.citation}</InfoTooltip></>}
                  value={destination.allowedDeduction}
                  {...(drill ? { onClick: drill } : {})}
                />
                {showCarryProration && (
                  <FormSubLine
                    text={`${allocationLabel}: ${fmtAmt(form4952Facts.deductibleInvestmentInterestExpense)} allowed × ${(destination.share * 100).toFixed(1)}% (${fmtAmt(destination.grossInterest)} of ${fmtAmt(totalInvIntExpense)} gross) = ${fmtAmt(destination.allowedDeduction)}${destination.carryforward > 0 ? `; carryforward ${fmtAmt(destination.carryforward)}` : ''}`}
                  />
                )}
              </div>
            )
          })}
          {hasTracingAllocation && form4952Facts.tracingSplitSources.map((source) => (
            <div key={source.sourceId} className="px-3 py-2">
              <div className="mb-1 text-[11px] font-medium text-foreground">{source.label}</div>
              <div className="grid gap-1 text-[11px] sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-2 py-1">
                  <span>Schedule A traced gross</span>
                  <span className="font-currency tabular-nums">{fmtAmt(source.scheduleAInterest)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-2 py-1">
                  <span>Schedule E traced gross</span>
                  <span className="font-currency tabular-nums">{fmtAmt(source.scheduleEInterest)}</span>
                </div>
              </div>
            </div>
          ))}
          {showCarryProration && (
            <FormLine
              label="Allocation method"
              raw={hasTracingAllocation
                ? `${form4952Facts.allocationMethodDescription} Treas. Reg. §1.163-8T traces debt proceeds to the expenditure use; collateral securing the debt does not control.`
                : form4952Facts.allocationMethodDescription}
              note
            />
          )}
        </FormBlock>
      )}

      {detailModal && (
        <Form4952SourceDetailModal
          open
          title={detailModal.title}
          {...(detailModal.description ? { description: detailModal.description } : {})}
          sources={detailModal.sources}
          amountMode={detailModal.amountMode}
          onGoToSource={handleGoToSource}
          onClose={() => setDetailModal(null)}
        />
      )}
    </div>
  )
}
