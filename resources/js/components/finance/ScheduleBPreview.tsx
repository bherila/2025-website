'use client'

import { FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { ScheduleBFacts, TaxFactSource } from '@/types/generated/tax-preview-facts'

interface ScheduleBPreviewProps {
  taxFacts?: ScheduleBFacts | null
  selectedYear: number
  onOpenDoc?: (docId: number) => void
}

function detailProps(source: TaxFactSource, onOpenDoc?: (docId: number) => void) {
  if (source.taxDocumentId === null || !onOpenDoc) {
    return {}
  }

  return {
    onDetails: () => onOpenDoc(source.taxDocumentId!),
  }
}

function SourceLines({
  sources,
  fallbackLabel,
  fallbackValue,
  emptyLabel,
  onOpenDoc,
}: {
  sources: TaxFactSource[]
  fallbackLabel: string
  fallbackValue: number
  emptyLabel: string
  onOpenDoc?: (docId: number) => void
}): React.ReactElement {
  if (sources.length > 0) {
    return (
      <>
        {sources.map((source) => (
          <FormLine
            key={source.id}
            label={source.label}
            value={source.amount}
            {...detailProps(source, onOpenDoc)}
          />
        ))}
      </>
    )
  }

  if (fallbackValue !== 0) {
    return <FormLine label={fallbackLabel} value={fallbackValue} />
  }

  return <FormLine label={emptyLabel} raw="-" />
}

export default function ScheduleBPreview({
  taxFacts,
  selectedYear,
  onOpenDoc,
}: ScheduleBPreviewProps): React.ReactElement {
  if (!taxFacts) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Schedule B facts are not loaded yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-0.5 text-base font-semibold">Schedule B — {selectedYear}</h3>
        <p className="text-xs text-muted-foreground">Interest and Ordinary Dividends</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <FormBlock title="Part I — Interest Income">
          <SourceLines
            sources={taxFacts.interestSources}
            fallbackLabel="Total interest income"
            fallbackValue={taxFacts.interestTotal}
            emptyLabel="No interest income reported"
            {...(onOpenDoc ? { onOpenDoc } : {})}
          />
          <FormTotalLine boxRef="4" label="Total interest" value={taxFacts.interestTotal} />
        </FormBlock>

        <FormBlock title="Part II — Ordinary Dividends">
          <SourceLines
            sources={taxFacts.ordinaryDividendSources}
            fallbackLabel="Total ordinary dividends"
            fallbackValue={taxFacts.ordinaryDividendTotal}
            emptyLabel="No dividend income reported"
            {...(onOpenDoc ? { onOpenDoc } : {})}
          />
          <FormTotalLine boxRef="6" label="Total ordinary dividends" value={taxFacts.ordinaryDividendTotal} />
          {taxFacts.qualifiedDividendTotal > 0 && (
            <>
              <SourceLines
                sources={taxFacts.qualifiedDividendSources}
                fallbackLabel="Qualified dividends"
                fallbackValue={taxFacts.qualifiedDividendTotal}
                emptyLabel="No qualified dividends reported"
                {...(onOpenDoc ? { onOpenDoc } : {})}
              />
              <FormTotalLine boxRef="7" label="Qualified dividends" value={taxFacts.qualifiedDividendTotal} />
            </>
          )}
        </FormBlock>
      </div>
    </div>
  )
}
