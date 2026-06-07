'use client'

import { useEffect, useState } from 'react'

import Form4952SourceDetailModal from '@/components/finance/Form4952SourceDetailModal'
import { ShortDividendSummaryCard } from '@/components/finance/ShortDividendDetailModal'
import type { ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import { k1CodeSourceFieldId, k1FieldSourceFieldId } from '@/lib/finance/taxSourceFieldIds'
import type { Form4952CalculationRow, Form4952Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import { Callout, FactsLoadingPlaceholder, fmtAmt, FormBlock, FormLine, FormSubLine, FormTotalLine, InfoTooltip, type NavGlyph } from './tax-preview-primitives'

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

/** Short label naming the destination a source's "go to" affordance leads to. */
function goToSourceLabel(source: TaxFactSource): string {
  if (source.formType === 'k1') {
    return 'K-1'
  }
  if (typeof source.formType === 'string' && source.formType.startsWith('1099')) {
    return '1099'
  }
  return 'Source'
}

interface DetailModalState {
  title: string
  description?: string
  sources: TaxFactSource[]
  calculationRows: Form4952CalculationRow[]
  amountMode: 'signed' | 'absolute' | 'expense'
}

function SourceRows({
  sources,
  emptyLabel,
  amountMode = 'signed',
  boxRef,
  onGoToSource,
}: {
  sources: TaxFactSource[]
  emptyLabel: string
  amountMode?: 'signed' | 'absolute' | 'expense'
  /** Box/line reference for the section — shown only on the first row (e.g. "1" for Part I line 1). */
  boxRef?: string
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
              {...(index === 0 && boxRef ? { boxRef } : {})}
              label={source.label}
              value={value}
              isReviewed={source.isReviewed === false ? false : undefined}
              {...(canGoToSource ? { onDetails: () => onGoToSource(source), detailsTooltip: `Open ${goToSourceLabel(source)}`, detailsGlyph: 'window' as NavGlyph } : {})}
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

  const facts = form4952Facts
  const totalInvIntExpense = facts.totalInvestmentInterestExpense
  const nii = facts.line6NetInvestmentIncome
  const totalQualDiv = facts.totalQualifiedDividends
  const hasActivity = totalInvIntExpense !== 0
    || facts.grossInvestmentIncomeTotal !== 0
    || facts.totalInvestmentExpenses !== 0
    || facts.totalExcludedInvestmentExpenses !== 0

  const fullyDeductible = facts.disallowedCarryforward === 0
  const electionStatus = fullyDeductible
    ? 'Not needed — interest is fully deductible'
    : facts.recommendedElection > 0
      ? `Available — up to ${fmtAmt(facts.recommendedElection)} could be elected`
      : 'No election available — the excess carries forward'
  const hasTracingAllocation = facts.allocationMethod === 'tracing' && facts.tracingSplitSources.length > 0
  const showCarryProration = facts.carryDestinations.length > 1

  // Surface any source the user has not yet reviewed, aggregated across every line.
  const unreviewedSources = [
    ...facts.investmentInterestSources,
    ...facts.investmentExpenseSources,
    ...facts.excludedInvestmentExpenseSources,
    ...facts.grossInvestmentIncomeFromK1Sources,
    ...facts.qualifiedDividendSources,
    ...facts.carryDestinations.flatMap((destination) => destination.sources),
  ].filter((source) => source.isReviewed === false)

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

  const openSourcesModal = (
    title: string,
    description: string,
    sources: TaxFactSource[],
    amountMode: DetailModalState['amountMode'] = 'signed',
    calculationRows: Form4952CalculationRow[] = [],
  ) => setDetailModal({ title, description, sources, amountMode, calculationRows })

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 4952 — Investment Interest Expense Deduction</h2>
        <p className="text-xs text-muted-foreground">
          §163(d) limitation — investment interest is deductible only to the extent of net investment
          income (NII). Any excess carries forward indefinitely.
        </p>
      </div>

      {unreviewedSources.length > 0 && (
        <Callout kind="warn" title={`⚠ ${unreviewedSources.length} source${unreviewedSources.length === 1 ? '' : 's'} not yet reviewed`}>
          <p>
            Verify these against their source documents before relying on the deduction:{' '}
            {unreviewedSources.slice(0, 4).map((source) => source.label).join('; ')}
            {unreviewedSources.length > 4 ? `; and ${unreviewedSources.length - 4} more` : ''}.
          </p>
        </Callout>
      )}

      {!hasActivity && (
        <Callout kind="info" title="No Form 4952 activity detected">
          <p>No investment interest expense or investment income is present in the backend tax facts.</p>
        </Callout>
      )}

      {hasActivity && (
        <FormBlock title="Summary">
          <FormTotalLine boxRef="3" label="Total investment interest expense" value={-totalInvIntExpense} />
          <FormLine boxRef="6" label="Net investment income (NII)" value={nii} />
          <FormLine boxRef="7" label="Disallowed — carried forward to next year" value={facts.disallowedCarryforward} />
          <FormTotalLine boxRef="8" label="Investment interest expense deduction" value={facts.deductibleInvestmentInterestExpense} double />
          <FormLine label="Qualified-dividend election" raw={electionStatus} note />
        </FormBlock>
      )}

      {fullyDeductible && totalInvIntExpense > 0 && (
        <Callout kind="good" title={`✓ Full ${fmtAmt(totalInvIntExpense)} Deductible — No QD Election Needed`}>
          <p>
            NII of <strong>{fmtAmt(nii)}</strong> already covers investment interest expense of{' '}
            <strong>{fmtAmt(totalInvIntExpense)}</strong>, so nothing carries forward and no qualified-dividend
            election is required.
          </p>
        </Callout>
      )}

      <Callout kind="info" title="ℹ How Form 4952 works">
        <p>
          Investment interest expense is deductible only up to your <strong>net investment income (NII)</strong> —
          the excess carries forward. Line 4a gross investment income includes interest, ordinary dividends,
          royalties, and K-1 investment income, but <strong>excludes</strong> net capital gain and qualified
          dividends unless you elect to include them on line 4g (which forfeits their preferential rate).
          IRC §163(d)(1), §163(d)(4)(B).
        </p>
      </Callout>

      <FormBlock title="Part I — Total Investment Interest Expense">
        <SourceRows
          sources={facts.investmentInterestSources}
          emptyLabel="No investment interest sources found"
          amountMode="expense"
          boxRef="1"
          onGoToSource={handleGoToSource}
        />
        <FormLine boxRef="2" label="Prior-year disallowed carryforward" raw="Check prior return" />
        <FormTotalLine boxRef="3" label="Total investment interest" value={-totalInvIntExpense} />
      </FormBlock>

      <FormBlock title="Part II — Net Investment Income">
        <FormLine
          boxRef="4a"
          label="Gross investment income from Schedule B"
          value={facts.grossInvestmentIncomeFromScheduleB}
          {...(onOpenScheduleB && facts.grossInvestmentIncomeFromScheduleB !== 0 ? { onClick: onOpenScheduleB, destinationTooltip: 'Open Schedule B' } : {})}
        />
        <FormLine
          boxRef="4a"
          label="Gross investment income from K-1s"
          value={facts.grossInvestmentIncomeFromK1}
          {...(facts.grossInvestmentIncomeFromK1Sources.length > 0
            ? {
              onDetails: () => openSourcesModal(
                'Gross investment income from K-1s (line 4a)',
                'Each partnership’s share of investment income that feeds Form 4952 line 4a. Net capital gain is excluded.',
                facts.grossInvestmentIncomeFromK1Sources,
              ),
              detailsTooltip: 'List each K-1 and go to its source',
              detailsGlyph: 'window' as NavGlyph,
            }
            : {})}
        />
        <FormTotalLine
          boxRef="4a"
          label={<>Gross investment income <InfoTooltip>Form 4952 line 4a: gross income from property held for investment — interest, ordinary dividends, royalties, and K-1 investment income. <strong>Excludes</strong> net capital gain and qualified dividends unless you elect to include them on line 4g (which forfeits the preferential rate). IRC §163(d)(4)(B); 2025 Form 4952 line 4a instructions.</InfoTooltip></>}
          value={facts.grossInvestmentIncomeTotal}
          onDetails={() => openSourcesModal(
            'Line 4a gross investment income',
            'How Form 4952 line 4a is assembled from Schedule B and K-1 investment income.',
            facts.grossInvestmentIncomeFromK1Sources,
            'signed',
            facts.line4aCalculationRows,
          )}
          detailsTooltip="Show line 4a sources and calculation"
        />
        {totalQualDiv > 0 && (
          <FormLine
            boxRef="4b"
            label={<>Qualified dividends included on line 4a <InfoTooltip>Qualified dividends are included in line 4a ordinary dividends but subtracted here (line 4b) and excluded from investment income unless you elect to include them on line 4g. Electing forfeits the preferential qualified-dividend rate on the elected amount. Flush language of IRC §163(d)(4)(B); §1(h)(11)(D)(i).</InfoTooltip></>}
            value={-totalQualDiv}
            {...(facts.qualifiedDividendSources.length > 0
              ? {
                onDetails: () => openSourcesModal(
                  'Qualified dividends included on line 4a (line 4b)',
                  'These qualified dividends are subtracted on line 4b. Go to each source to verify.',
                  facts.qualifiedDividendSources,
                ),
                detailsTooltip: 'List each qualified-dividend source',
                detailsGlyph: 'window' as NavGlyph,
              }
              : {})}
          />
        )}
        <FormLine
          boxRef="4c"
          label="Net investment income after qualified dividends"
          value={facts.line4cNetInvestmentIncomeAfterQualifiedDividends}
          onDetails={() => openSourcesModal(
            'Line 4c income after qualified dividends',
            'Line 4c subtracts qualified dividends included on line 4a unless they are elected back into investment income on line 4g.',
            facts.qualifiedDividendSources,
            'signed',
            facts.line4cCalculationRows,
          )}
          detailsTooltip="Show line 4c calculation"
        />
        <FormLine
          boxRef="4d"
          label={<>Net gain from disposition of investment property <InfoTooltip>Form 4952 line 4d: net gain (floored at 0) from selling property held for investment. For a non-materially-participating partner in a securities-trading partnership, the fund’s trading gains <strong>are</strong> property held for investment (IRC §163(d)(5)(A)(ii)), so they feed line 4d.</InfoTooltip></>}
          value={facts.line4dNetGainFromDisposition}
          onDetails={() => openSourcesModal(
            'Line 4d net gain from disposition',
            'Line 4d starts with the Schedule D net gain or loss, removes non-investment §1231 gain, then floors the result at $0.',
            [],
            'signed',
            facts.line4dCalculationRows,
          )}
          detailsTooltip="Show line 4d calculation"
        />
        <FormLine
          boxRef="4e"
          label={<>Net capital gain from disposition <InfoTooltip>Form 4952 line 4e: the smaller of line 4d or your net capital gain (the long-term, preferential-rate slice). It is excluded from investment income unless elected on line 4g. IRC §163(d)(4)(B)(iii).</InfoTooltip></>}
          value={facts.line4eNetCapitalGainFromDisposition}
          onDetails={() => openSourcesModal(
            'Line 4e net capital gain from disposition',
            'Line 4e is the preferential long-term slice, capped by line 4d. It does not raise investment income unless elected on line 4g.',
            [],
            'signed',
            facts.line4eCalculationRows,
          )}
          detailsTooltip="Show line 4e calculation"
        />
        <FormLine
          boxRef="4f"
          label={<>Net short-term gain (4d − 4e) <InfoTooltip>Form 4952 line 4f: the short-term slice of the disposition gain. It is investment income <strong>by default</strong> — no election is needed.</InfoTooltip></>}
          value={facts.line4fNetShortTermFromDisposition}
        />
        <FormLine
          boxRef="4g"
          label={<>Qualified dividends &amp; net capital gain elected <InfoTooltip>Form 4952 line 4g: the portion of qualified dividends (4b) and net capital gain (4e) you elect to include in investment income, forfeiting the 0/15/20% preferential rate. Defaults to $0; see the Special Election Smart Worksheet below. IRC §163(d)(4)(B)(iii).</InfoTooltip></>}
          value={facts.line4gElectedQualifiedDividendsAndGain}
        />
        <FormLine
          boxRef="4h"
          label={<>Total investment income (4c + 4f + 4g) <InfoTooltip>Form 4952 line 4h: net investment income before subtracting investment expenses.</InfoTooltip></>}
          value={facts.line4hTotalInvestmentIncome}
        />
        <SourceRows
          sources={facts.investmentExpenseSources}
          emptyLabel="No investment expenses reducing NII (§212 expenses are suspended through 2025)"
          boxRef="5"
          onGoToSource={handleGoToSource}
        />
        <FormTotalLine
          boxRef="6"
          label={<>Net investment income <InfoTooltip>Form 4952 line 6 (net investment income) = investment income (line 4h) − investment expenses (line 5). Investment interest is deductible only up to this amount; the excess carries forward. IRC §163(d)(1), §163(d)(4)(A).</InfoTooltip></>}
          value={nii}
        />
      </FormBlock>

      {(totalQualDiv > 0 || facts.line4eNetCapitalGainFromDisposition > 0) && (
        <FormBlock title="Special Election Smart Worksheet — Include Qualified Dividends / Net Capital Gain?">
          <FormLine label="A — Net investment income without election (4c + 4f − 5)" value={facts.electionNiiWithoutElection} />
          <FormLine label="B — Excess investment interest (line 3 − A)" value={facts.electionExcessInvestmentInterest} />
          <FormLine label="C — Amount available to elect (4b + 4e)" value={facts.electionAvailableForElection} />
          <FormTotalLine
            label={<>D — Maximum beneficial election (lesser of B and C) <InfoTooltip>Electing this amount on line 4g would let you deduct otherwise-disallowed investment interest, but it forfeits the preferential 0/15/20% rate on the elected qualified dividends / net capital gain. IRC §163(d)(4)(B)(iii); §1(h)(11)(D)(i).</InfoTooltip></>}
            value={facts.electionMaxBeneficial}
          />
          <FormLine
            label="Recommendation"
            raw={facts.recommendedElection > 0
              ? `Electing ${fmtAmt(facts.recommendedElection)} would unlock additional deduction (weigh against the preferential-rate cost).`
              : 'No election needed — investment interest is already fully deductible.'}
            note
          />
        </FormBlock>
      )}

      {facts.excludedInvestmentExpenseSources.length > 0 && (
        <FormBlock title="Tracked but Excluded Investment Expenses">
          <SourceRows
            sources={facts.excludedInvestmentExpenseSources}
            emptyLabel="No excluded investment expenses"
            onGoToSource={handleGoToSource}
          />
          <FormTotalLine
            label={<>Total excluded investment expenses <InfoTooltip>§212 investment expenses (e.g. K-1 Box 20B) are miscellaneous itemized deductions suspended for individuals 2018–2025 under §67(g) (TCJA), so they do not reduce NII on line 5. Trader-fund §162 expenses are instead deducted above the line on Schedule E.</InfoTooltip></>}
            value={facts.totalExcludedInvestmentExpenses}
          />
        </FormBlock>
      )}

      {shortDividendSummary && (
        <FormBlock title="Short Dividend Classification">
          <ShortDividendSummaryCard summary={shortDividendSummary} />
        </FormBlock>
      )}

      <FormBlock title="Part III — Investment Interest Expense Deduction">
        <FormLine
          boxRef="7"
          label={<>Disallowed investment interest carried forward <InfoTooltip>Form 4952 line 7: line 3 − line 6 (not below 0). Disallowed investment interest carries forward indefinitely to future years. IRC §163(d)(2).</InfoTooltip></>}
          value={facts.disallowedCarryforward}
        />
        <FormTotalLine
          boxRef="8"
          label={<>Investment interest expense deduction <InfoTooltip>Form 4952 line 8: the smaller of line 3 (total expense) or line 6 (NII).</InfoTooltip></>}
          value={facts.deductibleInvestmentInterestExpense}
          double
        />
      </FormBlock>

      {facts.carryDestinations.length > 0 && (
        <FormBlock title="Allocation of the Deduction (Worksheet lines 18–20)">
          <FormLine
            boxRef="18"
            label={<>Allowed investment interest expense (line 8) <InfoTooltip>The allowed deduction is split between Schedule E (above the line) and Schedule A (itemized). Non-materially-participating trader-fund interest is deducted above the line on Schedule E Part II line 28 (§163(d)(5)(A)(ii); Rev. Rul. 2008-12); the remainder is itemized on Schedule A line 9. When the §163(d) limit binds, the split is pro-rata per Rev. Rul. 2008-38.</InfoTooltip></>}
            value={facts.line18AllowedDeduction}
          />
          {facts.carryDestinations.map((destination) => {
            const drill = drillForDestination(destination.destination)
            const allocationLabel = hasTracingAllocation ? 'Tracing-based' : 'Pro-rata'
            const boxRef = destination.destination === 'sch-e' ? '19a' : destination.destination === 'sch-a' ? '20' : undefined
            return (
              <div key={destination.destination}>
                <FormLine
                  {...(boxRef ? { boxRef } : {})}
                  label={<>{destination.label} <InfoTooltip>{destination.citation}</InfoTooltip></>}
                  value={destination.allowedDeduction}
                  {...(drill ? { onClick: drill } : {})}
                  {...(destination.sources.length > 0
                    ? {
                      onDetails: () => openSourcesModal(
                        `${destination.label} — sources`,
                        'The individual investment-interest sources allocated to this destination.',
                        destination.sources,
                        'expense',
                      ),
                      detailsTooltip: 'List the sources allocated here',
                      detailsGlyph: 'window' as NavGlyph,
                    }
                    : {})}
                  {...(drill ? { destinationTooltip: `Open ${destination.formLine}` } : {})}
                />
                {showCarryProration && (
                  <FormSubLine
                    text={`${allocationLabel}: ${fmtAmt(facts.deductibleInvestmentInterestExpense)} allowed × ${(destination.share * 100).toFixed(1)}% (${fmtAmt(destination.grossInterest)} of ${fmtAmt(totalInvIntExpense)} gross) = ${fmtAmt(destination.allowedDeduction)}${destination.carryforward > 0 ? `; carryforward ${fmtAmt(destination.carryforward)}` : ''}`}
                  />
                )}
              </div>
            )
          })}
          {hasTracingAllocation && facts.tracingSplitSources.map((source) => (
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
                ? `${facts.allocationMethodDescription} Treas. Reg. §1.163-8T traces debt proceeds to the expenditure use; collateral securing the debt does not control.`
                : facts.allocationMethodDescription}
              note
            />
          )}
        </FormBlock>
      )}

      {facts.amt && (
        <FormBlock title="Alternative Minimum Tax (Form 4952 AMT)">
          <FormLine label="Regular-tax deduction (line 8)" value={facts.deductibleInvestmentInterestExpense} />
          <FormLine label="AMT deduction (line 8)" value={facts.amt.line8DeductibleInvestmentInterest} />
          <FormTotalLine
            label={<>Form 6251 line 2c adjustment <InfoTooltip>AMT recomputes Form 4952 using AMT investment income and expense (e.g. specified private-activity-bond interest is AMT-only investment income; a K-1 Box 17B basis adjustment changes the AMT gain on disposition). The regular-tax-minus-AMT difference in the line 8 deduction flows to Form 6251 line 2c — a positive amount increases AMTI. IRC §56(b)(1)(C).</InfoTooltip></>}
            value={facts.amt.line2cAdjustment}
          />
          {facts.amt.line2cAdjustment === 0 && (
            <FormLine label="AMT note" raw="No AMT adjustment — the AMT deduction equals the regular-tax deduction." note />
          )}
        </FormBlock>
      )}

      {detailModal && (
        <Form4952SourceDetailModal
          open
          title={detailModal.title}
          {...(detailModal.description ? { description: detailModal.description } : {})}
          sources={detailModal.sources}
          calculationRows={detailModal.calculationRows}
          amountMode={detailModal.amountMode}
          onGoToSource={handleGoToSource}
          onClose={() => setDetailModal(null)}
        />
      )}
    </div>
  )
}
