'use client'

import currency from 'currency.js'
import { useState } from 'react'

import { type EmptyLine, EmptyLinesDisclosure } from '@/components/finance/EmptyLinesDisclosure'
import { FactsLoadingPlaceholder, FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { TAX_TABS, type TaxTabId } from '@/components/finance/tax-tab-ids'
import { TaxFactSourcesModal, taxFactSourcesNeedReview } from '@/components/finance/TaxFactSourcesModal'
import type { Schedule1Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

interface Schedule1PreviewProps {
  selectedYear: number
  /** Navigate to a source tab when the user clicks Go-to-source from the disclosure. */
  onTabChange?: (tab: TaxTabId) => void
  /** Backend audit facts, including unreviewed parsed sources. */
  taxFacts?: Schedule1Facts | null
  onOpenDoc?: (docId: number) => void
}

export interface Schedule1Line8Breakdown {
  line8b: number
  line8h: number
  line8i: number
  line8z: number
}

/**
 * A Part I line is "visible" when its value is a non-zero number. Backend
 * facts always provide numeric totals, so zero means loaded-but-empty.
 */
function classifyPartIValue(value: number): 'visible' | 'zero' {
  return value === 0 ? 'zero' : 'visible'
}

function schedule1Line10Total(facts: Schedule1Facts): number {
  return currency(facts.line1aTotal)
    .add(facts.line2aTotal)
    .add(facts.line3Total)
    .add(facts.line4Total)
    .add(facts.line5Total)
    .add(facts.line6Total)
    .add(facts.line7Total)
    .add(facts.line9TotalOtherIncome).value
}

export default function Schedule1Preview({
  selectedYear,
  onTabChange,
  taxFacts,
  onOpenDoc,
}: Schedule1PreviewProps) {
  const [activeSources, setActiveSources] = useState<{
    title: string
    sources: TaxFactSource[]
    total: number
  } | null>(null)

  if (!taxFacts) {
    return <FactsLoadingPlaceholder label="Schedule 1" />
  }

  const line1aSources = taxFacts.line1aSources
  const line2aSources = taxFacts.line2aSources
  const line3Sources = taxFacts.line3Sources
  const line4Sources = taxFacts.line4Sources
  const line5Sources = taxFacts.line5Sources
  const line6Sources = taxFacts.line6Sources
  const line7Sources = taxFacts.line7Sources
  const line8Sources = taxFacts.line8Sources
  const line8bSources = taxFacts.line8bSources
  const line8hSources = taxFacts.line8hSources
  const line8iSources = taxFacts.line8iSources
  const line8zSources = taxFacts.line8zSources
  const line15Sources = taxFacts.line15Sources

  const line1aNeedsReview = taxFactSourcesNeedReview(line1aSources)
  const line2aNeedsReview = taxFactSourcesNeedReview(line2aSources)
  const line3NeedsReview = taxFactSourcesNeedReview(line3Sources)
  const line4NeedsReview = taxFactSourcesNeedReview(line4Sources)
  const line5NeedsReview = taxFactSourcesNeedReview(line5Sources)
  const line6NeedsReview = taxFactSourcesNeedReview(line6Sources)
  const line7NeedsReview = taxFactSourcesNeedReview(line7Sources)
  const line8bNeedsReview = taxFactSourcesNeedReview(line8bSources)
  const line8hNeedsReview = taxFactSourcesNeedReview(line8hSources)
  const line8iNeedsReview = taxFactSourcesNeedReview(line8iSources)
  const line8zNeedsReview = taxFactSourcesNeedReview(line8zSources)
  const lineOtherIncomeNeedsReview = taxFactSourcesNeedReview(line8Sources)
  const line15NeedsReview = taxFactSourcesNeedReview(line15Sources)
  const line10NeedsReview = line1aNeedsReview
    || line2aNeedsReview
    || line3NeedsReview
    || line4NeedsReview
    || line5NeedsReview
    || line6NeedsReview
    || line7NeedsReview
    || lineOtherIncomeNeedsReview
  const line10Total = schedule1Line10Total(taxFacts)

  const line1a = classifyPartIValue(taxFacts.line1aTotal)
  const line2a = classifyPartIValue(taxFacts.line2aTotal)
  const line3 = classifyPartIValue(taxFacts.line3Total)
  const line4 = classifyPartIValue(taxFacts.line4Total)
  const line5 = classifyPartIValue(taxFacts.line5Total)
  const line6 = classifyPartIValue(taxFacts.line6Total)
  const line7 = classifyPartIValue(taxFacts.line7Total)
  const line8b = classifyPartIValue(taxFacts.line8bTotal)
  const line8h = classifyPartIValue(taxFacts.line8hTotal)
  const line8i = classifyPartIValue(taxFacts.line8iTotal)
  const line8z = classifyPartIValue(taxFacts.line8zTotal)

  const partIEmpty: EmptyLine[] = []
  if (line1a !== 'visible') {
    partIEmpty.push({
      lineNumber: '1a',
      label: 'Taxable refunds, credits, or offsets of state/local income taxes',
      state: line1a,
      tooltip: 'No taxable refunds reported on any 1099-G box 2.',
    } as EmptyLine)
  }
  if (line2a !== 'visible') {
    partIEmpty.push({
      lineNumber: '2a',
      label: 'Alimony received (pre-2019 decrees only)',
      state: line2a,
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

  const partIIEmpty: EmptyLine[] = [
    { lineNumber: '13', label: 'Health savings account (HSA) deduction', state: 'zero' },
    { lineNumber: '17', label: 'Self-employed health insurance deduction', state: 'zero' },
    { lineNumber: '20', label: 'IRA deduction', state: 'zero' },
    { lineNumber: '21', label: 'Student loan interest deduction', state: 'zero' },
  ]

  const sourceClickProps = (title: string, sources: TaxFactSource[], total: number) =>
    sources.length > 0
      ? {
          onClick: () => setActiveSources({ title, sources, total }),
        }
      : {}

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
            <FormLine
              boxRef="1a"
              label="Taxable refunds, credits, or offsets of state and local income taxes"
              value={taxFacts.line1aTotal}
              isReviewed={line1aNeedsReview ? false : undefined}
              {...sourceClickProps('Schedule 1 Line 1a Supporting Details', line1aSources, taxFacts.line1aTotal)}
            />
            <FormSubLine text="From 1099-G box 2" />
          </>
        )}
        {line2a === 'visible' && (
          <>
            <FormLine
              boxRef="2a"
              label="Alimony received"
              value={taxFacts.line2aTotal}
              isReviewed={line2aNeedsReview ? false : undefined}
              {...sourceClickProps('Schedule 1 Line 2a Supporting Details', line2aSources, taxFacts.line2aTotal)}
            />
            <FormSubLine text="Pre-2019 divorce decrees only" />
          </>
        )}
        {line3 === 'visible' && (
          <>
            <FormLine
              boxRef="3"
              label="Business income or (loss)"
              value={taxFacts.line3Total}
              isReviewed={line3NeedsReview ? false : undefined}
              {...sourceClickProps('Schedule 1 Line 3 Supporting Details', line3Sources, taxFacts.line3Total)}
            />
            <FormSubLine text="From Schedule C net income" />
          </>
        )}
        {line4 === 'visible' && (
          <>
            <FormLine
              boxRef="4"
              label="Other gains or (losses)"
              value={taxFacts.line4Total}
              isReviewed={line4NeedsReview ? false : undefined}
              {...sourceClickProps('Schedule 1 Line 4 Supporting Details', line4Sources, taxFacts.line4Total)}
            />
            <FormSubLine text="From Form 4797 ordinary gain/loss total" />
          </>
        )}
        {line5 === 'visible' && (
          <>
            <FormLine
              boxRef="5"
              label="Rental real estate, royalties, partnerships, S corporations, trusts"
              value={taxFacts.line5Total}
              isReviewed={line5NeedsReview ? false : undefined}
              {...sourceClickProps('Schedule 1 Line 5 Supporting Details', line5Sources, taxFacts.line5Total)}
            />
            <FormSubLine text="From Schedule E combined total" />
          </>
        )}
        {line6 === 'visible' && (
          <>
            <FormLine
              boxRef="6"
              label="Farm income or (loss)"
              value={taxFacts.line6Total}
              isReviewed={line6NeedsReview ? false : undefined}
              {...sourceClickProps('Schedule 1 Line 6 Supporting Details', line6Sources, taxFacts.line6Total)}
            />
            <FormSubLine text="From Schedule F net profit/loss" />
          </>
        )}
        {line7 === 'visible' && (
          <>
            <FormLine
              boxRef="7"
              label="Unemployment compensation"
              value={taxFacts.line7Total}
              isReviewed={line7NeedsReview ? false : undefined}
              {...sourceClickProps('Schedule 1 Line 7 Supporting Details', line7Sources, taxFacts.line7Total)}
            />
            <FormSubLine text="From 1099-G box 1" />
          </>
        )}
        {line8b === 'visible' && (
          <>
            <FormLine
              boxRef="8b"
              label="Gambling winnings"
              value={taxFacts.line8bTotal}
              isReviewed={line8bNeedsReview ? false : undefined}
              {...sourceClickProps('Schedule 1 Line 8b Supporting Details', line8bSources, taxFacts.line8bTotal)}
            />
            <FormSubLine text="From 1099-MISC routed to Schedule 1 line 8b" />
          </>
        )}
        {line8h === 'visible' && (
          <>
            <FormLine
              boxRef="8h"
              label="Jury duty pay"
              value={taxFacts.line8hTotal}
              isReviewed={line8hNeedsReview ? false : undefined}
              {...sourceClickProps('Schedule 1 Line 8h Supporting Details', line8hSources, taxFacts.line8hTotal)}
            />
            <FormSubLine text="From 1099-MISC routed to Schedule 1 line 8h" />
          </>
        )}
        {line8i === 'visible' && (
          <>
            <FormLine
              boxRef="8i"
              label="Prizes and awards"
              value={taxFacts.line8iTotal}
              isReviewed={line8iNeedsReview ? false : undefined}
              {...sourceClickProps('Schedule 1 Line 8i Supporting Details', line8iSources, taxFacts.line8iTotal)}
            />
            <FormSubLine text="From 1099-MISC routed to Schedule 1 line 8i" />
          </>
        )}
        {line8z === 'visible' && (
          <>
            <FormLine
              boxRef="8z"
              label="Other income"
              value={taxFacts.line8zTotal}
              isReviewed={line8zNeedsReview ? false : undefined}
              {...sourceClickProps('Schedule 1 Line 8z Supporting Details', line8zSources, taxFacts.line8zTotal)}
            />
            <FormSubLine text="From 1099-MISC documents routed or defaulted to Schedule 1 line 8z" />
          </>
        )}
        {taxFacts.line9TotalOtherIncome !== 0 && (
          <FormTotalLine
            boxRef="9"
            label="Total other income (sum of lines 8a-8z)"
            value={taxFacts.line9TotalOtherIncome}
            isReviewed={lineOtherIncomeNeedsReview ? false : undefined}
            {...sourceClickProps('Schedule 1 Line 9 Supporting Details', line8Sources, taxFacts.line9TotalOtherIncome)}
          />
        )}
        <FormTotalLine
          boxRef="10"
          label="Total additional income (to Form 1040 line 8)"
          value={line10Total}
          isReviewed={line10NeedsReview ? false : undefined}
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
          value={taxFacts.line15Total === 0 ? null : taxFacts.line15Total}
          isReviewed={line15NeedsReview ? false : undefined}
          {...sourceClickProps('Schedule 1 Line 15 Supporting Details', line15Sources, taxFacts.line15Total)}
        />
        <FormSubLine text="Computed from Schedule SE and included in Form 1040 line 10." />
        <FormTotalLine
          boxRef="26"
          label="Total adjustments to income (to Form 1040 line 10)"
          value={taxFacts.line15Total}
          isReviewed={line15NeedsReview ? false : undefined}
          double
        />
        <EmptyLinesDisclosure
          lines={partIIEmpty}
          sectionLabel="Part II"
          {...(onTabChange ? { onGoToSource: onTabChange } : {})}
        />
      </FormBlock>
      {activeSources && (
        <TaxFactSourcesModal
          open
          title={activeSources.title}
          sources={activeSources.sources}
          total={activeSources.total}
          onClose={() => setActiveSources(null)}
          {...(onOpenDoc ? { onOpenDoc } : {})}
        />
      )}
    </div>
  )
}
