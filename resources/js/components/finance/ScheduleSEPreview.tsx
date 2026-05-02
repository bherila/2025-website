'use client'


import { isFK1StructuredData } from '@/components/finance/k1'
import { Callout, fmtAmt, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import {
  computeMedicareWages,
  computeScheduleSELines,
  computeSocialSecurityWages,
  type ScheduleSELines,
  type ScheduleSESourceEntry,
} from '@/finance/scheduleSE/computeScheduleSE'
import { sumK1CodeItems } from '@/lib/finance/k1Utils'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

export type { ScheduleSELines } from '@/finance/scheduleSE/computeScheduleSE'

function getCodeValue(data: FK1StructuredData, box: string, code: string): number {
  return sumK1CodeItems(data, box, code)
}

interface ScheduleSEPreviewProps {
  reviewedK1Docs: TaxDocument[]
  scheduleCNetIncome: number
  selectedYear: number
  isMarried?: boolean
  reviewedW2Docs?: TaxDocument[]
  payslips?: fin_payslip[]
  /** Net farm profit from Schedule F line 34. Only positive values create SE tax; losses are ignored. */
  scheduleFNetProfit?: number
  onOpenDoc?: (docId: number) => void
  onGoToScheduleC?: () => void
}

export function computeScheduleSE({
  reviewedK1Docs,
  scheduleCNetIncome,
  selectedYear,
  isMarried = false,
  reviewedW2Docs = [],
  payslips = [],
  scheduleFNetProfit = 0,
}: ScheduleSEPreviewProps): ScheduleSELines {
  const entries: ScheduleSESourceEntry[] = reviewedK1Docs
    .map((doc) => {
      const data = isFK1StructuredData(doc.parsed_data) ? doc.parsed_data : null
      if (!data) return []

      const label =
        data.fields['B']?.value?.split('\n')[0] ??
        doc.employment_entity?.display_name ??
        doc.original_filename ??
        'Partnership'

      const netEarnings = getCodeValue(data, '14', 'A')
      const farmEarnings = getCodeValue(data, '14', 'C')

      return [
        ...(netEarnings !== 0 ? [{ label: `${label} — Box 14A net earnings from self-employment`, amount: netEarnings, sourceType: 'k1_box14_a' as const }] : []),
        ...(farmEarnings !== 0 ? [{ label: `${label} — Box 14C farm income`, amount: farmEarnings, sourceType: 'k1_box14_c' as const }] : []),
      ]
    })
    .flat()

  if (scheduleCNetIncome !== 0) {
    entries.push({
      label: 'Schedule C net earnings',
      amount: scheduleCNetIncome,
      sourceType: 'schedule_c',
    })
  }

  if (scheduleFNetProfit > 0) {
    entries.push({
      label: 'Schedule F net farm profit (line 34)',
      amount: scheduleFNetProfit,
      sourceType: 'schedule_f',
    })
  }

  return computeScheduleSELines({
    entries,
    year: selectedYear,
    isMarried,
    socialSecurityWages: computeSocialSecurityWages(reviewedW2Docs, payslips),
    medicareWages: computeMedicareWages(reviewedW2Docs, payslips),
  })
}

export default function ScheduleSEPreview({
  reviewedK1Docs,
  scheduleCNetIncome,
  selectedYear,
  isMarried = false,
  reviewedW2Docs = [],
  payslips = [],
  onOpenDoc,
  onGoToScheduleC,
}: ScheduleSEPreviewProps) {
  const computed = computeScheduleSE({
    reviewedK1Docs,
    scheduleCNetIncome,
    selectedYear,
    isMarried,
    reviewedW2Docs,
    payslips,
  })

  if (computed.entries.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold mb-0.5">Schedule SE — Self-Employment Tax</h2>
          <p className="text-xs text-muted-foreground">
            No self-employment earnings found from reviewed K-1 Box 14 items or Schedule C.
          </p>
        </div>
        {(reviewedK1Docs.length > 0 || onGoToScheduleC) && (
          <div className="rounded-lg border border-border divide-y divide-border text-sm">
            {reviewedK1Docs.map((doc) => {
              const data = isFK1StructuredData(doc.parsed_data) ? doc.parsed_data : null
              const name =
                data?.fields['B']?.value?.split('\n')[0] ??
                doc.employment_entity?.display_name ??
                doc.original_filename ??
                'K-1 Document'
              return (
                <div key={doc.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-muted-foreground truncate">{name} — K-1 (no Box 14 SE earnings)</span>
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
              )
            })}
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
            Add a Schedule C or review a K-1 with Box 14 earnings to populate this schedule.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Schedule SE — Self-Employment Tax</h2>
        <p className="text-xs text-muted-foreground">
          Computes regular SE tax for Schedule 2 Line 4 and the deductible half for Schedule 1.
        </p>
      </div>

      {computed.seTax > 0 ? (
        <Callout kind="good" title="✓ Schedule SE is included in the current estimate">
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
        <Callout kind="info" title="ℹ Self-employment items were found, but no SE tax is due">
          <p>
            Net earnings do not produce regular self-employment tax after netting losses and applying the
            Schedule SE earnings factor.
          </p>
        </Callout>
      )}

      <FormBlock title="Self-Employment Earnings Sources">
        {computed.entries.map((entry, index) => (
          <FormLine key={`${entry.label}-${index}`} label={entry.label} value={entry.amount} />
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
