'use client'

import currency from 'currency.js'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Schedule1Facts, ScheduleAFacts, ScheduleDFacts, TaxFactSource, TaxPreviewFacts } from '@/types/generated/tax-preview-facts'

import { fmtAmt, NavGlyphIcon } from './tax-preview-primitives'

export interface TaxFactSourceLike {
  id?: string
  label: string
  amount: number
  formType?: string | null
  notes?: string | null
  reviewAction?: string | null
  taxDocumentId?: number | null
  isReviewed?: boolean
}

/** True when any source is still an unreviewed estimate that needs confirmation. */
export function taxFactSourcesNeedReview(sources: readonly TaxFactSourceLike[]): boolean {
  return sources.some((source) => source.isReviewed === false)
}

type AmountMode = 'signed' | 'absolute'
type AmountTone = 'success' | 'destructive'

export interface TaxFactSourceDetailPayload {
  title: string
  description?: string
  sources: TaxFactSource[]
  total: number
  amountMode: AmountMode
  positiveAmountTone: AmountTone
}

function signed(title: string, sources: TaxFactSource[], total: number): TaxFactSourceDetailPayload {
  return { title, sources, total, amountMode: 'signed', positiveAmountTone: 'success' }
}

function splitKey(key: string): [form: string, line: string] {
  const idx = key.indexOf(':')
  if (idx === -1) {
    return [key, '']
  }
  return [key.slice(0, idx), key.slice(idx + 1)]
}

function schedule1Detail(f: Schedule1Facts, line: string): TaxFactSourceDetailPayload | null {
  switch (line) {
    case 'line-1a':
      return signed('Schedule 1 Line 1a Supporting Details', f.line1aSources, f.line1aTotal)
    case 'line-2a':
      return signed('Schedule 1 Line 2a Supporting Details', f.line2aSources, f.line2aTotal)
    case 'line-3':
      return signed('Schedule 1 Line 3 Supporting Details', f.line3Sources, f.line3Total)
    case 'line-4':
      return signed('Schedule 1 Line 4 Supporting Details', f.line4Sources, f.line4Total)
    case 'line-5':
      return signed('Schedule 1 Line 5 Supporting Details', f.line5Sources, f.line5Total)
    case 'line-6':
      return signed('Schedule 1 Line 6 Supporting Details', f.line6Sources, f.line6Total)
    case 'line-7':
      return signed('Schedule 1 Line 7 Supporting Details', f.line7Sources, f.line7Total)
    case 'line-8b':
      return signed('Schedule 1 Line 8b Supporting Details', f.line8bSources, f.line8bTotal)
    case 'line-8h':
      return signed('Schedule 1 Line 8h Supporting Details', f.line8hSources, f.line8hTotal)
    case 'line-8i':
      return signed('Schedule 1 Line 8i Supporting Details', f.line8iSources, f.line8iTotal)
    case 'line-8z':
      return signed('Schedule 1 Line 8z Supporting Details', f.line8zSources, f.line8zTotal)
    case 'line-9':
      return signed('Schedule 1 Line 9 Supporting Details', f.line8Sources, f.line9TotalOtherIncome)
    case 'line-15':
      return signed('Schedule 1 Line 15 Supporting Details', f.line15Sources, f.line15Total)
    default:
      return null
  }
}

function scheduleADetail(f: ScheduleAFacts, line: string): TaxFactSourceDetailPayload | null {
  switch (line) {
    case 'line-5a': {
      const isSalesTax = f.selectedLine5aType === 'sales_tax'
      return signed(
        'Schedule A Line 5a Supporting Details',
        isSalesTax ? f.salesTaxSources : f.stateIncomeTaxSources,
        f.selectedLine5aTotal,
      )
    }
    case 'line-5b':
      return signed('Schedule A Line 5b Supporting Details', f.realEstateTaxSources, f.realEstateTaxTotal)
    case 'line-8':
      return signed('Schedule A Line 8 Supporting Details', f.mortgageInterestSources, f.mortgageInterestTotal)
    case 'line-9':
      return {
        title: 'Investment Interest Expense — Data Sources',
        description: 'Each margin-interest and K-1 investment-interest source flowing to Schedule A line 9 (Form 4952 allowed deduction). Amounts are shown as positive deduction figures.',
        sources: f.investmentInterestSources,
        total: f.investmentInterestTotal,
        amountMode: 'absolute',
        positiveAmountTone: 'destructive',
      }
    case 'line-11':
      return signed('Schedule A Line 11 Supporting Details', f.charitableCashSources, f.charitableCashTotal)
    case 'line-12':
      return signed('Schedule A Line 12 Supporting Details', f.charitableNoncashSources, f.charitableNoncashTotal)
    case 'line-16':
      return signed('Schedule A Line 16 Supporting Details', f.otherItemizedSources, f.otherItemizedTotal)
    default:
      return null
  }
}

function scheduleDDetail(f: ScheduleDFacts, line: string): TaxFactSourceDetailPayload | null {
  switch (line) {
    case 'line-5':
      return signed('Schedule D Line 5 Supporting Details', f.line5Sources, f.line5GainLoss)
    default:
      return null
  }
}

/**
 * Resolves the source-detail payload behind a tax-preview form line from a stable
 * `<form>:<line>` instance key (e.g. `sch-a:line-8`).
 *
 * This is the keyed derivation that consolidates what used to be built inline as
 * per-form `setActiveSources` modal state across Schedule 1, Schedule A, and
 * Schedule D. The returned payload drives {@link TaxFactSourceDetailColumn},
 * which opens as a Miller column. Returns `null` when the key is unknown (a stale
 * route after the facts changed) or when its facts slice is missing.
 */
export function taxFactSourceDetailColumn(
  facts: TaxPreviewFacts | null | undefined,
  key: string | undefined,
): TaxFactSourceDetailPayload | null {
  if (!facts || !key) {
    return null
  }
  const [form, line] = splitKey(key)
  switch (form) {
    case 'sch-1':
      return schedule1Detail(facts.schedule1, line)
    case 'sch-a':
      return scheduleADetail(facts.scheduleA, line)
    case 'sch-d':
      return scheduleDDetail(facts.scheduleD, line)
    default:
      return null
  }
}

function formatAmount(amount: number, mode: AmountMode): string {
  if (mode === 'absolute') {
    return currency(Math.abs(amount)).format()
  }
  return fmtAmt(amount)
}

function toneClass(amount: number, tone: AmountTone): string {
  if (amount < 0) {
    return 'text-destructive'
  }
  return tone === 'destructive' ? 'text-destructive' : 'text-success'
}

function goToLabel(source: TaxFactSource): string {
  const target = source.formType ? source.formType.replaceAll('_', '-').toUpperCase() : 'source'
  return `Go to ${target}`
}

/**
 * Lists the individual sources behind a tax-preview form line as a drillable
 * Miller column (replacing the former shared source-detail modal). From here a
 * user can push a further column into each source's document instead of
 * dead-ending in a dialog. Unreviewed estimates keep their review-required
 * treatment.
 */
export default function TaxFactSourceDetailColumn({
  facts,
  instanceKey,
  onGoToSource,
}: {
  facts: TaxPreviewFacts | null | undefined
  instanceKey: string | undefined
  onGoToSource: (source: TaxFactSource) => void
}) {
  const payload = taxFactSourceDetailColumn(facts, instanceKey)

  if (!payload) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">This detail is no longer available.</p>
      </div>
    )
  }

  const { title, description, sources, total, amountMode, positiveAmountTone } = payload
  const hasUnreviewedSources = taxFactSourcesNeedReview(sources)

  return (
    <div className="space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {sources.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No sources found.</p>
      ) : (
        <div className="space-y-3">
          {sources.map((source, index) => {
            const isReviewed = source.isReviewed !== false

            return (
              <div
                key={source.id ?? `${source.label}-${index}`}
                className={`rounded-md border p-3 ${isReviewed ? 'border-border/60' : 'border-warning/50 bg-warning/10'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-medium leading-snug">{source.label}</div>
                    {!isReviewed && <div className="text-xs font-medium text-warning">Estimated — review required</div>}
                    {source.notes && <div className="text-xs leading-snug text-muted-foreground">{source.notes}</div>}
                    {!isReviewed && source.reviewAction && (
                      <div className="text-xs leading-snug text-warning">{source.reviewAction}</div>
                    )}
                  </div>
                  <div className={`font-currency shrink-0 text-right text-sm tabular-nums ${isReviewed ? toneClass(source.amount, positiveAmountTone) : 'text-warning'}`}>
                    {formatAmount(source.amount, amountMode)}
                  </div>
                </div>
                {source.taxDocumentId != null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3 h-7 gap-1.5 px-2 text-xs"
                        aria-label={goToLabel(source)}
                        onClick={() => onGoToSource(source)}
                      >
                        <NavGlyphIcon glyph="window" />
                        {goToLabel(source)}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{goToLabel(source)}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )
          })}
          <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold">
            <span>Total</span>
            <span className={`font-currency tabular-nums ${hasUnreviewedSources ? 'text-warning' : toneClass(total, positiveAmountTone)}`}>
              {formatAmount(total, amountMode)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
