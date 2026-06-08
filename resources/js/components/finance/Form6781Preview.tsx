'use client'

import { ArrowRight } from 'lucide-react'

import { Callout, FactsLoadingPlaceholder, FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { Button } from '@/components/ui/button'
import type { Form6781Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

interface Form6781PreviewProps {
  form6781Facts?: Form6781Facts | null
  onOpenDoc?: (docId: number) => void
  onGoToScheduleD?: () => void
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
  boxRef: string
  onOpenDoc?: (docId: number) => void
}) {
  return (
    <div>
      <FormLine
        boxRef={boxRef}
        label={source.label}
        value={source.amount}
        isReviewed={source.isReviewed === false ? false : undefined}
        {...lineDetailProps(source, onOpenDoc)}
      />
      {source.notes && <FormSubLine text={source.notes} />}
    </div>
  )
}

export default function Form6781Preview({
  form6781Facts,
  onOpenDoc,
  onGoToScheduleD,
}: Form6781PreviewProps) {
  if (!form6781Facts) {
    return <FactsLoadingPlaceholder label="Form 6781" />
  }

  const facts = form6781Facts
  const hasSources = facts.shortTermSources.length > 0 || facts.longTermSources.length > 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold mb-0.5">Form 6781 — Section 1256 Contracts &amp; Straddles</h2>
          <p className="text-xs text-muted-foreground">
            Section 1256 gains and losses split to Schedule D line 4 and line 11.
          </p>
        </div>
        {onGoToScheduleD && (
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={onGoToScheduleD}>
            Go to Schedule D
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>

      {!hasSources && (
        <Callout kind="info" title="No Form 6781 activity detected">
          <p>No K-1 Box 11C Section 1256 contract sources are present in the backend tax facts.</p>
        </Callout>
      )}

      <FormBlock title="Part I — Short-Term Allocation">
        {facts.shortTermSources.length === 0 ? (
          <FormLine boxRef="4" label="No short-term Section 1256 sources" raw="—" />
        ) : (
          facts.shortTermSources.map((source) => (
            <SourceLine key={source.id} source={source} boxRef="4" {...(onOpenDoc ? { onOpenDoc } : {})} />
          ))
        )}
        <FormTotalLine
          boxRef="4"
          label="Total short-term allocation to Schedule D line 4"
          value={facts.shortTermTotal}
          {...(onGoToScheduleD ? { onClick: onGoToScheduleD, destinationTooltip: 'Go to Schedule D line 4' } : {})}
        />
      </FormBlock>

      <FormBlock title="Part II — Long-Term Allocation">
        {facts.longTermSources.length === 0 ? (
          <FormLine boxRef="11" label="No long-term Section 1256 sources" raw="—" />
        ) : (
          facts.longTermSources.map((source) => (
            <SourceLine key={source.id} source={source} boxRef="11" {...(onOpenDoc ? { onOpenDoc } : {})} />
          ))
        )}
        <FormTotalLine
          boxRef="11"
          label="Total long-term allocation to Schedule D line 11"
          value={facts.longTermTotal}
          {...(onGoToScheduleD ? { onClick: onGoToScheduleD, destinationTooltip: 'Go to Schedule D line 11' } : {})}
        />
      </FormBlock>

      <FormBlock title="Summary">
        <FormTotalLine label="Net Section 1256 gain or (loss)" value={facts.netGain} double />
      </FormBlock>

      <Callout kind="info" title="Section 1256 Contracts">
        <p>
          Section 1256 contracts are marked to market at year-end. 60% of the gain or loss is treated
          as long-term regardless of holding period. The backend facts route the 40%/60% split to
          Schedule D lines 4 and 11.
        </p>
      </Callout>
    </div>
  )
}
