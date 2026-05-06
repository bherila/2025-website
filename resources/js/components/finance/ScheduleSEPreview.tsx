'use client'

import { Callout, fmtAmt, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { ScheduleSEFacts } from '@/types/generated/tax-preview-facts'

interface ScheduleSEPreviewProps {
  taxFacts?: ScheduleSEFacts | null
  reviewedK1Docs?: TaxDocument[]
  selectedYear: number
  isMarried?: boolean
  onOpenDoc?: (docId: number) => void
  onGoToScheduleC?: () => void
}

export default function ScheduleSEPreview({
  taxFacts,
  reviewedK1Docs = [],
  selectedYear,
  isMarried = false,
  onOpenDoc,
  onGoToScheduleC,
}: ScheduleSEPreviewProps) {
  const computed = taxFacts

  if (!computed || computed.entries.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold mb-0.5">Schedule SE — Self-Employment Tax</h2>
          <p className="text-xs text-muted-foreground">
            No self-employment earnings found from reviewed K-1 Box 14 items, Schedule C, or Schedule F.
          </p>
        </div>
        {(reviewedK1Docs.length > 0 || onGoToScheduleC) && (
          <div className="rounded-lg border border-border divide-y divide-border text-sm">
            {reviewedK1Docs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-muted-foreground truncate">{doc.original_filename ?? 'K-1 Document'} — K-1</span>
                {onOpenDoc && (
                  <button
                    type="button"
                    onClick={() => onOpenDoc(doc.id)}
                    className="shrink-0 text-xs text-primary hover:underline focus-visible:outline-none"
                  >
                    Open
                  </button>
                )}
              </div>
            ))}
            {onGoToScheduleC && (
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-muted-foreground">Schedule C — self-employment business income</span>
                <button
                  type="button"
                  onClick={onGoToScheduleC}
                  className="shrink-0 text-xs text-primary hover:underline focus-visible:outline-none"
                >
                  Go to Sch C
                </button>
              </div>
            )}
          </div>
        )}
        {reviewedK1Docs.length === 0 && !onGoToScheduleC && (
          <p className="text-center text-muted-foreground text-sm py-8">
            Add a Schedule C, Schedule F, or review a K-1 with Box 14 earnings to populate this schedule.
          </p>
        )}
      </div>
    )
  }

  const scheduleFNeedsReview = computed.scheduleFSources.some((source) => source.reviewStatus === 'needs_review')

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Schedule SE — Self-Employment Tax</h2>
        <p className="text-xs text-muted-foreground">
          Computes regular SE tax for Schedule 2 Line 4 and the deductible half for Schedule 1.
        </p>
      </div>

      {computed.seTax > 0 ? (
        <Callout kind="good" title="Schedule SE is included in the current estimate">
          <p>
            Regular self-employment tax of <strong>{fmtAmt(computed.seTax, 2)}</strong> is included on
            Schedule 2 Line 4, and the deductible half of <strong>{fmtAmt(computed.deductibleSeTax, 2)}</strong>{' '}
            is available as a Schedule 1 adjustment.
          </p>
          {computed.additionalMedicareTax > 0 && (
            <p>
              Additional Medicare Tax of <strong>{fmtAmt(computed.additionalMedicareTax, 2)}</strong> is
              separately included on Schedule 2 Line 11.
            </p>
          )}
        </Callout>
      ) : (
        <Callout kind="info" title="Self-employment items were found, but no SE tax is due">
          <p>
            Net earnings do not produce regular self-employment tax after netting losses and applying the
            Schedule SE earnings factor.
          </p>
        </Callout>
      )}

      {scheduleFNeedsReview && (
        <Callout kind="info" title="Schedule F needs review">
          Review farm self-employment earnings before relying on Schedule SE for {selectedYear}.
        </Callout>
      )}

      <FormBlock title="Self-Employment Earnings Sources">
        {computed.entries.map((entry) => (
          <FormLine key={entry.id} label={entry.label} value={entry.amount} />
        ))}
        <FormTotalLine label="Net earnings from self-employment" value={computed.netEarningsFromSE} />
        <FormLine boxRef="4a" label="92.35% earnings factor" value={computed.seTaxableEarnings} />
      </FormBlock>

      <FormBlock title="Social Security Portion (12.4%)">
        <FormLine label={`Social Security wage base (${selectedYear})`} value={computed.socialSecurityWageBase} />
        {computed.socialSecurityWages > 0 && (
          <FormLine label="Less: wages already subject to Social Security tax" value={-computed.socialSecurityWages} />
        )}
        <FormLine label="Remaining Social Security wage base" value={computed.remainingSocialSecurityWageBase} />
        <FormLine label="Taxable earnings subject to 12.4%" value={computed.socialSecurityTaxableEarnings} />
        <FormTotalLine label="Social Security tax" value={computed.socialSecurityTax} />
      </FormBlock>

      <FormBlock title="Medicare Portion (2.9% + Additional 0.9%)">
        <FormLine label="Taxable earnings subject to 2.9% Medicare tax" value={computed.medicareTaxableEarnings} />
        <FormLine label="Medicare portion of SE tax" value={computed.medicareTax} />
        <FormLine
          label={`Additional Medicare threshold (${isMarried ? 'MFJ' : 'Single'})`}
          value={computed.additionalMedicareThreshold}
        />
        {computed.medicareWages > 0 && (
          <FormLine label="Less: wages already counted toward the threshold" value={-computed.medicareWages} />
        )}
        <FormLine label="SE earnings above Additional Medicare threshold" value={computed.additionalMedicareTaxableEarnings} />
        <FormTotalLine label="Additional Medicare tax (Form 8959)" value={computed.additionalMedicareTax} />
      </FormBlock>

      <FormBlock title="Schedule SE Summary">
        <FormTotalLine label="Self-employment tax — Schedule 2 Line 4" value={computed.seTax} double />
        <FormLine label="Deductible half of SE tax — Schedule 1 adjustment" value={computed.deductibleSeTax} />
      </FormBlock>
    </div>
  )
}
