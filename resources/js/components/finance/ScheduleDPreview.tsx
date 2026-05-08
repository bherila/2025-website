'use client'

import currency from 'currency.js'
import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'

import { Callout, FactsLoadingPlaceholder, fmtAmt, FormBlock, FormLine, FormSubLine, FormTotalLine, InfoTooltip } from '@/components/finance/tax-preview-primitives'
import { TaxFactSourcesModal } from '@/components/finance/TaxFactSourcesModal'
import { Button } from '@/components/ui/button'
import type { ScheduleDFacts, ScheduleDRollupFact, TaxFactSource } from '@/types/generated/tax-preview-facts'

interface ScheduleDPreviewProps {
  taxFacts?: ScheduleDFacts | null
  selectedYear?: number
  onOpenDoc?: (docId: number) => void
  onGoToForm1040?: () => void
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
    detailsLabel: 'Detail',
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

export default function ScheduleDPreview({
  taxFacts,
  selectedYear,
  onOpenDoc,
  onGoToForm1040,
}: ScheduleDPreviewProps) {
  const [line5DetailsOpen, setLine5DetailsOpen] = useState(false)
  const taxYear = selectedYear ?? new Date().getFullYear()

  if (!taxFacts) {
    return <FactsLoadingPlaceholder label="Schedule D" />
  }

  const shortTermRollups = taxFacts.form8949Rollups.filter((rollup) => rollup.isShortTerm)
  const longTermRollups = taxFacts.form8949Rollups.filter((rollup) => !rollup.isShortTerm)
  const hasBrokerData = taxFacts.form8949Rollups.length > 0
  const has11sAmbiguous = taxFacts.ambiguous11SSources.length > 0
  const section1256ShortTermTotal = taxFacts.line3Sources.reduce((acc, source) => acc.add(source.amount), currency(0)).value
  const section1256LongTermTotal = taxFacts.line10Sources.reduce((acc, source) => acc.add(source.amount), currency(0)).value

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Schedule D — Capital Gains &amp; Losses</h2>
        <p className="text-xs text-muted-foreground">
          Capital gains, losses, and Section 1256 contract analysis.
        </p>
      </div>

      {(taxFacts.line3Sources.length > 0 || taxFacts.line10Sources.length > 0) && (
        <>
          <FormBlock title="Form 6781 — Section 1256 Contracts &amp; Straddles">
            {taxFacts.line3Sources.map((source) => (
              <SourceLine key={source.id} source={source} boxRef="3" {...(onOpenDoc ? { onOpenDoc } : {})} />
            ))}
            {taxFacts.line10Sources.map((source) => (
              <SourceLine key={source.id} source={source} boxRef="10" {...(onOpenDoc ? { onOpenDoc } : {})} />
            ))}
            <FormTotalLine label="Total Sec. 1256 short-term allocation" value={section1256ShortTermTotal} />
            <FormTotalLine label="Total Sec. 1256 long-term allocation" value={section1256LongTermTotal} />
          </FormBlock>
          <Callout kind="info" title="ℹ Section 1256 Contracts">
            <p>
              Section 1256 contracts are marked to market at year-end. 60% of the gain/loss is treated as long-term
              regardless of holding period. The backend facts route the 40%/60% split to Schedule D lines 3 and 10.
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

      <div className="grid grid-cols-1 gap-4">
        <FormBlock title="Schedule D Part I — Short-Term">
          {shortTermRollups.map((rollup) => (
            <RollupLine key={`${rollup.form8949Box}-${rollup.scheduleDLine}`} rollup={rollup} />
          ))}
          {taxFacts.line3Sources.map((source) => (
            <SourceLine key={source.id} source={source} boxRef="3" {...(onOpenDoc ? { onOpenDoc } : {})} />
          ))}
          {taxFacts.line5Sources.map((source) => (
            <SourceLine key={source.id} source={source} boxRef="5" {...(onOpenDoc ? { onOpenDoc } : {})} />
          ))}
          {taxFacts.line6Carryover !== 0 && (
            <FormLine boxRef="6" label={`${taxYear - 1} short-term capital loss carryover`} value={taxFacts.line6Carryover} />
          )}
          {shortTermRollups.length === 0 && taxFacts.line3Sources.length === 0 && taxFacts.line5Sources.length === 0 && taxFacts.line6Carryover === 0 && (
            <FormLine label="No short-term items" raw="—" />
          )}
          {taxFacts.line5Sources.length > 0 && (
            <FormTotalLine
              boxRef="5"
              label="Line 5 total — short-term gain or (loss) from partnerships"
              value={taxFacts.line5GainLoss}
              onClick={() => setLine5DetailsOpen(true)}
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

      <TaxFactSourcesModal
        open={line5DetailsOpen}
        title="Schedule D Line 5 Supporting Details"
        sources={taxFacts.line5Sources}
        total={taxFacts.line5GainLoss}
        onClose={() => setLine5DetailsOpen(false)}
        {...(onOpenDoc ? { onOpenDoc } : {})}
      />
    </div>
  )
}
