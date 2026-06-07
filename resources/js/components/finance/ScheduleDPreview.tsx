'use client'

import currency from 'currency.js'
import { ChevronLeft, Loader2, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'

import { Callout, FactsLoadingPlaceholder, fmtAmt, FormBlock, FormLine, FormSubLine, FormTotalLine, InfoTooltip } from '@/components/finance/tax-preview-primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'
import type { CapitalLossCarryoverLines } from '@/types/finance/tax-return'
import type { ScheduleDFacts, ScheduleDRollupFact, TaxFactSource } from '@/types/generated/tax-preview-facts'

interface ScheduleDPreviewProps {
  taxFacts?: ScheduleDFacts | null
  selectedYear?: number
  availableYears?: number[]
  priorYearCapitalLossCarryover?: CapitalLossCarryoverLines | null
  onOpenDoc?: (docId: number) => void
  /** Push a `tax-source-detail` Miller column for a `<form>:<line>` instance key. */
  onOpenDetail?: (instanceKey: string) => void
  onGoToForm1040?: () => void
  onCarryoverSaved?: (() => Promise<void> | void) | undefined
}

const SCHEDULE_D_CARRYOVER_ENDPOINT = '/api/finance/schedule-d-carryovers'

const nonnegativeMoneyString = z.string().trim().refine((value) => {
  if (value === '') {
    return true
  }

  const amount = Number(value)

  return Number.isFinite(amount) && amount >= 0
}, 'Enter zero or a positive amount.')

const scheduleDCarryoverInputSchema = z.object({
  short_term_loss_carryover: nonnegativeMoneyString,
  long_term_loss_carryover: nonnegativeMoneyString,
  notes: z.string(),
})

type ScheduleDCarryoverInputForm = z.infer<typeof scheduleDCarryoverInputSchema>

interface ScheduleDCarryoverInputResponse {
  id: number | null
  tax_year: number
  short_term_loss_carryover: number
  long_term_loss_carryover: number
  notes: string | null
}

interface CarryoverNotice {
  title: string
  body: string
}

function moneyInputString(value: number | null | undefined): string {
  return value === null || value === undefined ? '0' : String(value)
}

function sourceFormLabel(source: TaxFactSource): string {
  return source.formType?.replaceAll('_', '-').toUpperCase() ?? 'source'
}

function lineDetailProps(source: TaxFactSource, onOpenDoc?: (docId: number) => void) {
  if (source.taxDocumentId === null || !onOpenDoc) {
    return {}
  }

  const label = sourceFormLabel(source)

  return {
    onDetails: () => onOpenDoc(source.taxDocumentId!),
    detailsTooltip: `Open ${label} detail`,
  }
}

function SourceLine({
  source,
  boxRef,
  onOpenDoc,
}: {
  source: TaxFactSource
  boxRef?: string
  onOpenDoc?: (docId: number) => void
}) {
  return (
    <div>
      <FormLine
        {...(boxRef ? { boxRef } : {})}
        label={source.label}
        value={source.amount}
        isReviewed={source.isReviewed === false ? false : undefined}
        {...lineDetailProps(source, onOpenDoc)}
      />
      {source.notes && <FormSubLine text={source.notes} />}
    </div>
  )
}

function RollupLine({ rollup }: { rollup: ScheduleDRollupFact }) {
  return (
    <FormLine
      boxRef={rollup.scheduleDLine}
      label={`Form 8949 Box ${rollup.form8949Box} — ${rollup.rowCount} row${rollup.rowCount === 1 ? '' : 's'}`}
      value={rollup.netGainOrLoss}
    />
  )
}

function carryoverNoticeFor({
  taxYear,
  availableYears,
  hasOpeningCarryover,
  priorYearCapitalLossCarryover,
}: {
  taxYear: number
  availableYears: number[]
  hasOpeningCarryover: boolean
  priorYearCapitalLossCarryover: CapitalLossCarryoverLines | null | undefined
}): CarryoverNotice | null {
  if (hasOpeningCarryover) {
    return null
  }

  if (priorYearCapitalLossCarryover?.hasCarryover) {
    return {
      title: 'Prior-year carryover not applied',
      body: `The nearest prior-year preview shows ${fmtAmt(priorYearCapitalLossCarryover.totalCarryover)} of capital-loss carryover, but Schedule D lines 6 and 14 are still zero. Save opening carryovers below to apply them.`,
    }
  }

  const hasExactPriorYear = availableYears.includes(taxYear - 1)

  if (!hasExactPriorYear) {
    return {
      title: 'Prior-year Schedule D not found',
      body: `${taxYear - 1} is not available in Tax Preview. New users often need to enter carryovers from their filed Schedule D or Capital Loss Carryover Worksheet before this preview is complete.`,
    }
  }

  return {
    title: 'Prior-year carryover showing zero',
    body: 'The prior-year preview is present, but no opening capital-loss carryover is applied here. Confirm against the filed return and enter an override if needed.',
  }
}

export default function ScheduleDPreview({
  taxFacts,
  selectedYear,
  availableYears = [],
  priorYearCapitalLossCarryover,
  onOpenDoc,
  onOpenDetail,
  onGoToForm1040,
  onCarryoverSaved,
}: ScheduleDPreviewProps) {
  const taxYear = selectedYear ?? new Date().getFullYear()
  const [carryoverForm, setCarryoverForm] = useState<ScheduleDCarryoverInputForm>({
    short_term_loss_carryover: '0',
    long_term_loss_carryover: '0',
    notes: '',
  })
  const [carryoverLoading, setCarryoverLoading] = useState(false)
  const [carryoverSaving, setCarryoverSaving] = useState(false)
  const [carryoverError, setCarryoverError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadCarryovers = async () => {
      setCarryoverLoading(true)
      setCarryoverError(null)

      try {
        const row = await fetchWrapper.get(`${SCHEDULE_D_CARRYOVER_ENDPOINT}?year=${taxYear}`) as ScheduleDCarryoverInputResponse
        if (!cancelled) {
          setCarryoverForm({
            short_term_loss_carryover: moneyInputString(row.short_term_loss_carryover),
            long_term_loss_carryover: moneyInputString(row.long_term_loss_carryover),
            notes: row.notes ?? '',
          })
        }
      } catch {
        if (!cancelled) {
          setCarryoverError('Failed to load Schedule D carryover inputs.')
        }
      } finally {
        if (!cancelled) {
          setCarryoverLoading(false)
        }
      }
    }

    void loadCarryovers()

    return () => {
      cancelled = true
    }
  }, [taxYear])

  const hasOpeningCarryover = taxFacts ? taxFacts.line6Carryover !== 0 || taxFacts.line14Carryover !== 0 : false
  const carryoverNotice = useMemo(() => carryoverNoticeFor({
    taxYear,
    availableYears,
    hasOpeningCarryover,
    priorYearCapitalLossCarryover,
  }), [availableYears, hasOpeningCarryover, priorYearCapitalLossCarryover, taxYear])

  async function saveCarryovers(): Promise<void> {
    const parsed = scheduleDCarryoverInputSchema.safeParse(carryoverForm)
    if (!parsed.success) {
      setCarryoverError('Carryovers must be zero or positive amounts.')
      return
    }

    setCarryoverSaving(true)
    setCarryoverError(null)

    try {
      await fetchWrapper.put(SCHEDULE_D_CARRYOVER_ENDPOINT, {
        tax_year: taxYear,
        short_term_loss_carryover: Number(parsed.data.short_term_loss_carryover || 0),
        long_term_loss_carryover: Number(parsed.data.long_term_loss_carryover || 0),
        notes: parsed.data.notes.trim() || null,
      })
      await onCarryoverSaved?.()
    } catch {
      setCarryoverError('Failed to save Schedule D carryover inputs.')
    } finally {
      setCarryoverSaving(false)
    }
  }

  function fillFromPriorYearPreview(): void {
    if (!priorYearCapitalLossCarryover?.hasCarryover) {
      return
    }

    setCarryoverForm((current) => ({
      ...current,
      short_term_loss_carryover: moneyInputString(priorYearCapitalLossCarryover.shortTermCarryover),
      long_term_loss_carryover: moneyInputString(priorYearCapitalLossCarryover.longTermCarryover),
    }))
  }

  if (!taxFacts) {
    return <FactsLoadingPlaceholder label="Schedule D" />
  }

  const shortTermRollups = taxFacts.form8949Rollups.filter((rollup) => rollup.isShortTerm)
  const longTermRollups = taxFacts.form8949Rollups.filter((rollup) => !rollup.isShortTerm)
  const hasBrokerData = taxFacts.form8949Rollups.length > 0
  const has11sAmbiguous = taxFacts.ambiguous11SSources.length > 0
  const section1256ShortTermTotal = taxFacts.line4Sources.reduce((acc, source) => acc.add(source.amount), currency(0)).value
  const section1256LongTermTotal = taxFacts.line11Sources.reduce((acc, source) => acc.add(source.amount), currency(0)).value

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Schedule D — Capital Gains &amp; Losses</h2>
        <p className="text-xs text-muted-foreground">
          Capital gains, losses, and Section 1256 contract analysis.
        </p>
      </div>

      {(taxFacts.line4Sources.length > 0 || taxFacts.line11Sources.length > 0) && (
        <>
          <FormBlock title="Form 6781 — Section 1256 Contracts &amp; Straddles">
            {taxFacts.line4Sources.map((source) => (
              <SourceLine key={source.id} source={source} boxRef="4" {...(onOpenDoc ? { onOpenDoc } : {})} />
            ))}
            {taxFacts.line11Sources.map((source) => (
              <SourceLine key={source.id} source={source} boxRef="11" {...(onOpenDoc ? { onOpenDoc } : {})} />
            ))}
            <FormTotalLine label="Total Sec. 1256 short-term allocation" value={section1256ShortTermTotal} />
            <FormTotalLine label="Total Sec. 1256 long-term allocation" value={section1256LongTermTotal} />
          </FormBlock>
          <Callout kind="info" title="ℹ Section 1256 Contracts">
            <p>
              Section 1256 contracts are marked to market at year-end. 60% of the gain/loss is treated as long-term
              regardless of holding period. The backend facts route the 40%/60% split to Schedule D lines 4 and 11.
            </p>
          </Callout>
        </>
      )}

      {has11sAmbiguous && (
        <Callout kind="warn" title="⚠ Box 11S — Confirm S/T vs. L/T character">
          <p>
            One or more K-1 Box 11S lines could not be classified as short-term or long-term from their notes.
            Those amounts are not included in Schedule D totals until the K-1 review data identifies character.
          </p>
        </Callout>
      )}

      {has11sAmbiguous && (
        <FormBlock title="Box 11S — Unclassified Non-Portfolio Capital Gain / (Loss)">
          {taxFacts.ambiguous11SSources.map((source) => (
            <div key={source.id}>
              <FormLine
                label={(
                  <span className="inline-flex items-center gap-1">
                    {source.label}
                    <InfoTooltip>
                      This line is intentionally excluded from Schedule D until its short-term or long-term character
                      is available in the K-1 review data.
                    </InfoTooltip>
                  </span>
                )}
                value={source.amount}
                isReviewed={source.isReviewed === false ? false : undefined}
                {...lineDetailProps(source, onOpenDoc)}
              />
              {source.notes && <FormSubLine text={source.notes} />}
            </div>
          ))}
          <FormTotalLine
            label="Not yet routed to Schedule D"
            value={taxFacts.ambiguous11SAmount}
          />
        </FormBlock>
      )}

      <FormBlock title="Prior-Year Capital Loss Carryovers">
        <div className="space-y-3 px-3 py-3">
          {carryoverNotice && (
            <Callout kind="warn" title={carryoverNotice.title}>
              <p>{carryoverNotice.body}</p>
            </Callout>
          )}
          {carryoverError && (
            <div role="alert" className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {carryoverError}
            </div>
          )}
          {carryoverLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Enter loss carryovers as positive amounts. The preview posts them to Schedule D line 6 and line 14 as negative values.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`schedule-d-short-carryover-${taxYear}`}>Short-term loss carryover</Label>
                  <Input
                    id={`schedule-d-short-carryover-${taxYear}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={carryoverForm.short_term_loss_carryover}
                    onChange={(event) => setCarryoverForm((current) => ({
                      ...current,
                      short_term_loss_carryover: event.target.value,
                    }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`schedule-d-long-carryover-${taxYear}`}>Long-term loss carryover</Label>
                  <Input
                    id={`schedule-d-long-carryover-${taxYear}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={carryoverForm.long_term_loss_carryover}
                    onChange={(event) => setCarryoverForm((current) => ({
                      ...current,
                      long_term_loss_carryover: event.target.value,
                    }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div>Current line 6: {fmtAmt(taxFacts.line6Carryover)}</div>
                <div>Current line 14: {fmtAmt(taxFacts.line14Carryover)}</div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`schedule-d-carryover-notes-${taxYear}`}>Notes</Label>
                <Textarea
                  id={`schedule-d-carryover-notes-${taxYear}`}
                  value={carryoverForm.notes}
                  onChange={(event) => setCarryoverForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Filed return worksheet, preparer note, or other source"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {priorYearCapitalLossCarryover?.hasCarryover
                    ? `Prior-year preview carryover: ${fmtAmt(priorYearCapitalLossCarryover.totalCarryover)}`
                    : 'Use the prior filed return if this is the first year tracked here.'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {priorYearCapitalLossCarryover?.hasCarryover && (
                    <Button type="button" variant="outline" size="sm" onClick={fillFromPriorYearPreview}>
                      Use prior-year preview
                    </Button>
                  )}
                  <Button type="button" size="sm" onClick={saveCarryovers} disabled={carryoverSaving}>
                    {carryoverSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save carryovers
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </FormBlock>

      <div className="grid grid-cols-1 gap-4">
        <FormBlock title="Schedule D Part I — Short-Term">
          {shortTermRollups.map((rollup) => (
            <RollupLine key={`${rollup.form8949Box}-${rollup.scheduleDLine}`} rollup={rollup} />
          ))}
          {taxFacts.line3Sources.map((source) => (
            <SourceLine key={source.id} source={source} boxRef="3" {...(onOpenDoc ? { onOpenDoc } : {})} />
          ))}
          {taxFacts.line4Sources.map((source) => (
            <SourceLine key={source.id} source={source} boxRef="4" {...(onOpenDoc ? { onOpenDoc } : {})} />
          ))}
          {taxFacts.line5Sources.map((source) => (
            <SourceLine key={source.id} source={source} boxRef="5" {...(onOpenDoc ? { onOpenDoc } : {})} />
          ))}
          {taxFacts.line6Carryover !== 0 && (
            <FormLine boxRef="6" label={`${taxYear - 1} short-term capital loss carryover`} value={taxFacts.line6Carryover} />
          )}
          {shortTermRollups.length === 0
            && taxFacts.line3Sources.length === 0
            && taxFacts.line4Sources.length === 0
            && taxFacts.line5Sources.length === 0
            && taxFacts.line6Carryover === 0 && (
            <FormLine label="No short-term items" raw="—" />
          )}
          {taxFacts.line5Sources.length > 0 && (
            <FormTotalLine
              boxRef="5"
              label="Line 5 total — short-term gain or (loss) from partnerships"
              value={taxFacts.line5GainLoss}
              {...(onOpenDetail
                ? {
                    onDetails: () => onOpenDetail('sch-d:line-5'),
                    detailsTooltip: 'Schedule D Line 5 Supporting Details',
                    detailsGlyph: 'column' as const,
                  }
                : {})}
            />
          )}
          <FormTotalLine boxRef="7" label="Net Short-Term" value={taxFacts.line7NetShortTerm} />
        </FormBlock>

        <FormBlock title="Schedule D Part II — Long-Term">
          {longTermRollups.map((rollup) => (
            <RollupLine key={`${rollup.form8949Box}-${rollup.scheduleDLine}`} rollup={rollup} />
          ))}
          {taxFacts.line10Sources.map((source) => (
            <SourceLine key={source.id} source={source} boxRef="10" {...(onOpenDoc ? { onOpenDoc } : {})} />
          ))}
          {taxFacts.line11Sources.map((source) => (
            <SourceLine key={source.id} source={source} boxRef="11" {...(onOpenDoc ? { onOpenDoc } : {})} />
          ))}
          {taxFacts.line12Sources.map((source) => (
            <SourceLine key={source.id} source={source} boxRef="12" {...(onOpenDoc ? { onOpenDoc } : {})} />
          ))}
          {taxFacts.line13Sources.map((source) => (
            <SourceLine key={source.id} source={source} boxRef="13" {...(onOpenDoc ? { onOpenDoc } : {})} />
          ))}
          {taxFacts.line14Carryover !== 0 && (
            <FormLine boxRef="14" label={`${taxYear - 1} long-term capital loss carryover`} value={taxFacts.line14Carryover} />
          )}
          {longTermRollups.length === 0
            && taxFacts.line10Sources.length === 0
            && taxFacts.line11Sources.length === 0
            && taxFacts.line12Sources.length === 0
            && taxFacts.line13Sources.length === 0
            && taxFacts.line14Carryover === 0 && (
            <FormLine label="No long-term items" raw="—" />
          )}
          <FormTotalLine boxRef="15" label="Net Long-Term" value={taxFacts.line15NetLongTerm} />
        </FormBlock>
      </div>

      <FormBlock title="Schedule D Summary">
        <FormLine boxRef="7" label="Net short-term capital gain (loss)" value={taxFacts.line7NetShortTerm} />
        <FormLine boxRef="15" label="Net long-term capital gain (loss)" value={taxFacts.line15NetLongTerm} />
        <FormTotalLine boxRef="16" label="Combined net capital gain (loss)" value={taxFacts.line16Combined} />
        {taxFacts.line16Combined < 0 && (
          <>
            <FormLine
              boxRef="21"
              label={(
                <span className="flex flex-wrap items-center gap-2">
                  <span>Capital loss applied to {taxYear} return</span>
                  {onGoToForm1040 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1.5 px-2 text-[11px]"
                      onClick={(e) => {
                        e.stopPropagation()
                        onGoToForm1040()
                      }}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      Form 1040 line 7
                    </Button>
                  )}
                </span>
              )}
              value={taxFacts.appliedToReturn}
            />
            <FormLine
              label={`Capital loss carryforward to ${taxYear + 1}`}
              value={taxFacts.carryforward}
            />
          </>
        )}
      </FormBlock>

      {taxFacts.carryforward < 0 && Math.abs(taxFacts.carryforward) > 5000 && (
        <Callout kind="warn" title="⚠ Large Capital Loss Carryforward">
          <p>
            ~<strong>{fmtAmt(Math.abs(taxFacts.carryforward))}</strong> carries to next year (only $3,000 allowed annually).
            Confirm exact ST/LT split from your completed Schedule D to determine character of carryforward.
          </p>
        </Callout>
      )}

      {!hasBrokerData && (
        <Callout kind="info" title="ℹ 1099-B Not Yet Uploaded">
          <p>
            No Form 8949 rollups are present in backend facts. Upload and review brokerage 1099 documents in the
            Overview tab to include brokerage transactions in this analysis.
          </p>
        </Callout>
      )}

    </div>
  )
}
