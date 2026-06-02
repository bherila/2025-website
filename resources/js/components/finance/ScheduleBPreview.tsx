'use client'

import { FormBlock, FormLine, FormTotalLine, OpenAllK1Button } from '@/components/finance/tax-preview-primitives'
import type { ScheduleBFacts, TaxFactSource } from '@/types/generated/tax-preview-facts'

interface ScheduleBPreviewProps {
  taxFacts?: ScheduleBFacts | null
  selectedYear: number
  onOpenDoc?: (docId: number) => void
  onOpenAllK1?: () => void
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
  totalLabel,
  totalValue,
  emptyLabel,
  onOpenDoc,
}: {
  sources: TaxFactSource[]
  totalLabel: string
  totalValue: number
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

  if (totalValue !== 0) {
    return <FormLine label={totalLabel} value={totalValue} />
  }

  return <FormLine label={emptyLabel} raw="-" />
}

export default function ScheduleBPreview({
  taxFacts,
  selectedYear,
  onOpenDoc,
  onOpenAllK1,
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="mb-0.5 text-base font-semibold">Schedule B — {selectedYear}</h3>
          <p className="text-xs text-muted-foreground">Interest and Ordinary Dividends</p>
        </div>
        {onOpenAllK1 && <OpenAllK1Button onClick={onOpenAllK1} />}
      </div>

      <div className="grid grid-cols-1 gap-4">
        <FormBlock title="Part I — Interest Income">
          <SourceLines
            sources={taxFacts.interestSources}
            totalLabel="Total interest income"
            totalValue={taxFacts.interestTotal}
            emptyLabel="No interest income reported"
            {...(onOpenDoc ? { onOpenDoc } : {})}
          />
          <FormTotalLine boxRef="4" label="Total interest" value={taxFacts.interestTotal} />
        </FormBlock>

        <FormBlock title="Part II — Ordinary Dividends">
          <SourceLines
            sources={taxFacts.ordinaryDividendSources}
            totalLabel="Total ordinary dividends"
            totalValue={taxFacts.ordinaryDividendTotal}
            emptyLabel="No dividend income reported"
            {...(onOpenDoc ? { onOpenDoc } : {})}
          />
          <FormTotalLine boxRef="6" label="Total ordinary dividends" value={taxFacts.ordinaryDividendTotal} />
          {taxFacts.qualifiedDividendTotal > 0 && (
            <>
              <SourceLines
                sources={taxFacts.qualifiedDividendSources}
                totalLabel="Qualified dividends"
                totalValue={taxFacts.qualifiedDividendTotal}
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
